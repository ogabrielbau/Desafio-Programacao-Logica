// script.js — versão final integrada
// Parser + transformações + UI wiring
// Atualizado para incluir todos os passos exigidos: renomear, eliminar →/↔, NNF, extração Prenex (prefixo + matriz),
// transformação da matriz para CNF AST com distribuição, transformação para DNF AST, skolemização, forma cláusal e verificação Horn.

// --- Token types
const TT = {
  FORALL: "FORALL", EXISTS: "EXISTS", NEG: "NEG", AND: "AND", OR: "OR",
  IMP: "IMP", IFF: "IFF", LPAREN: "LPAREN", RPAREN: "RPAREN", DOT: "DOT",
  COMMA: "COMMA", PRED: "PRED", ID: "ID", EOF: "EOF"
};

let gensym = 0;
function fresh(pref) { return pref + (++gensym); }

// Preprocess: aceita variantes LaTeX simples e remove comandos de espaçamento comuns
function preprocessInput(raw) {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/\\(,|;|:|\s|quad|qquad|thinspace|,)/g, " ");
  s = s.replace(/\\implies|\\Rightarrow|=>/g, "\\to");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Tokenizer
function tokenize(input) {
  const src = input;
  const tokens = [];
  let i = 0, n = src.length;
  const startsWith = (s) => src.slice(i, i + s.length) === s;
  const isLetter = (ch) => /[A-Za-z]/.test(ch);
  const isIdent = (ch) => /[A-Za-z0-9_]/.test(ch);

  while (i < n) {
    const ch = src[i];
    if (ch === " ") { i++; continue; }
    if (startsWith("\\forall")) { tokens.push({ type: TT.FORALL }); i += 7; continue; }
    if (startsWith("\\exists")) { tokens.push({ type: TT.EXISTS }); i += 7; continue; }
    if (startsWith("\\neg") || startsWith("\\lnot")) { tokens.push({ type: TT.NEG }); i += (startsWith("\\neg")?4:6); continue; }
    if (startsWith("\\land")) { tokens.push({ type: TT.AND }); i += 5; continue; }
    if (startsWith("\\lor")) { tokens.push({ type: TT.OR }); i += 4; continue; }
    if (startsWith("\\to") || startsWith("\\rightarrow") || startsWith("\\implies")) {
      tokens.push({ type: TT.IMP });
      if (startsWith("\\to")) i += 3; else if (startsWith("\\implies")) i += 8; else i += 10;
      continue;
    }
    if (startsWith("\\leftrightarrow")) { tokens.push({ type: TT.IFF }); i += 15; continue; }
    if (ch === "(") { tokens.push({ type: TT.LPAREN }); i++; continue; }
    if (ch === ")") { tokens.push({ type: TT.RPAREN }); i++; continue; }
    if (ch === ".") { tokens.push({ type: TT.DOT }); i++; continue; }
    if (ch === ",") { tokens.push({ type: TT.COMMA }); i++; continue; }
    if (isLetter(ch)) {
      let j = i + 1;
      while (j < n && isIdent(src[j])) j++;
      const ident = src.slice(i, j);
      if (/^[A-Z]/.test(ident)) tokens.push({ type: TT.PRED, value: ident });
      else tokens.push({ type: TT.ID, value: ident });
      i = j;
      continue;
    }
    throw new Error(`Caractere inesperado: '${ch}' em posição ${i}`);
  }
  tokens.push({ type: TT.EOF });
  return tokens;
}

// AST constructors
const Pred = (n, a = []) => ({ type: "Pred", name: n, args: a });
const Not = (sub) => ({ type: "Not", sub });
const And = (l, r) => ({ type: "And", left: l, right: r });
const Or = (l, r) => ({ type: "Or", left: l, right: r });
const Imp = (l, r) => ({ type: "Imp", left: l, right: r });
const Iff = (l, r) => ({ type: "Iff", left: l, right: r });
const ForAll = (v, s) => ({ type: "ForAll", v, sub: s });
const Exists = (v, s) => ({ type: "Exists", v, sub: s });
const VarT = (n) => ({ t: "Var", name: n });
const FuncT = (n, a = []) => ({ t: "Func", name: n, args: a });

// Parser (recursive descent)
function parse(rawInput) {
  const pre = preprocessInput(rawInput);
  const tokens = tokenize(pre);
  let k = 0;
  const peek = () => tokens[k];
  const eat = (type) => {
    const t = tokens[k];
    if (!t) throw new Error("Token inesperado (fim prematuro).");
    if (t.type !== type) throw new Error(`Esperado ${type} mas obteve ${t.type}`);
    k++; return t;
  };

  function parseTerm() {
    const t = peek();
    if (t.type !== TT.ID) throw new Error("Esperado variável/função (ex: x, f(x)).");
    const id = eat(TT.ID).value;
    if (peek().type === TT.LPAREN) {
      eat(TT.LPAREN);
      const args = [];
      if (peek().type !== TT.RPAREN) { args.push(parseTerm()); while (peek().type === TT.COMMA) { eat(TT.COMMA); args.push(parseTerm()); } }
      eat(TT.RPAREN);
      return FuncT(id, args);
    }
    return VarT(id);
  }

  function parseAtom() {
    const t = peek();
    if (t.type === TT.PRED) {
      const name = eat(TT.PRED).value;
      if (peek().type === TT.LPAREN) {
        eat(TT.LPAREN);
        const args = [];
        if (peek().type !== TT.RPAREN) { args.push(parseTerm()); while (peek().type === TT.COMMA) { eat(TT.COMMA); args.push(parseTerm()); } }
        eat(TT.RPAREN);
        return Pred(name, args);
      }
      return Pred(name, []);
    }
    throw new Error("Esperado predicado (ex: P, Q(x)).");
  }

  function parseQN() {
    const t = peek();
    if (t.type === TT.FORALL || t.type === TT.EXISTS) {
      const isFor = t.type === TT.FORALL; eat(t.type); const v = eat(TT.ID).value; if (peek().type === TT.DOT) eat(TT.DOT); const sub = parseImp(); return isFor ? ForAll(v, sub) : Exists(v, sub);
    }
    if (t.type === TT.NEG) { eat(TT.NEG); return Not(parseQN()); }
    if (t.type === TT.LPAREN) { eat(TT.LPAREN); const f = parseImp(); eat(TT.RPAREN); return f; }
    return parseAtom();
  }

  function parseAnd() { let n = parseQN(); while (peek().type === TT.AND) { eat(TT.AND); n = And(n, parseQN()); } return n; }
  function parseOr() { let n = parseAnd(); while (peek().type === TT.OR) { eat(TT.OR); n = Or(n, parseAnd()); } return n; }
  function parseImp() { let n = parseOr(); while (peek().type === TT.IMP || peek().type === TT.IFF) { const t = peek(); if (t.type === TT.IMP) { eat(TT.IMP); n = Imp(n, parseOr()); } else { eat(TT.IFF); n = Iff(n, parseOr()); } } return n; }

  const ast = parseImp();
  if (peek().type !== TT.EOF) throw new Error("Tokens residuais apos parse");
  return ast;
}

// ---------- substitution & utilities ----------
function cloneTerm(t) { if (t.t === "Var") return VarT(t.name); return FuncT(t.name, t.args.map(cloneTerm)); }
function replaceVarInTerm(t, v, repl) { if (t.t === "Var") return (t.name === v) ? cloneTerm(repl) : VarT(t.name); return FuncT(t.name, t.args.map(a => replaceVarInTerm(a, v, repl))); }
function substituteVar(ast, v, repl) {
  switch (ast.type) {
    case "Pred": return Pred(ast.name, ast.args.map(t => replaceVarInTerm(t, v, repl)));
    case "Not": return Not(substituteVar(ast.sub, v, repl));
    case "And": return And(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
    case "Or": return Or(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
    case "Imp": return Imp(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
    case "Iff": return Iff(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
    case "ForAll": if (ast.v === v) return ForAll(ast.v, ast.sub); return ForAll(ast.v, substituteVar(ast.sub, v, repl));
    case "Exists": if (ast.v === v) return Exists(ast.v, ast.sub); return Exists(ast.v, substituteVar(ast.sub, v, repl));
    default: return ast;
  }
}

// ---------- alpha-renaming ----------
function renameBound(ast) {
  switch (ast.type) {
    case "ForAll": { const newv = fresh("x"); const sub2 = substituteVar(ast.sub, ast.v, VarT(newv)); return ForAll(newv, renameBound(sub2)); }
    case "Exists": { const newv = fresh("x"); const sub2 = substituteVar(ast.sub, ast.v, VarT(newv)); return Exists(newv, renameBound(sub2)); }
    case "Not": return Not(renameBound(ast.sub));
    case "And": return And(renameBound(ast.left), renameBound(ast.right));
    case "Or": return Or(renameBound(ast.left), renameBound(ast.right));
    case "Imp": return Imp(renameBound(ast.left), renameBound(ast.right));
    case "Iff": return Iff(renameBound(ast.left), renameBound(ast.right));
    default: return ast;
  }
}

// ---------- elimImpIff ----------
function elimImpIff(ast) {
  switch (ast.type) {
    case "Imp": return Or(Not(elimImpIff(ast.left)), elimImpIff(ast.right));
    case "Iff": { const A = elimImpIff(ast.left); const B = elimImpIff(ast.right); return And(Or(Not(A), B), Or(Not(B), A)); }
    case "Not": return Not(elimImpIff(ast.sub));
    case "And": return And(elimImpIff(ast.left), elimImpIff(ast.right));
    case "Or": return Or(elimImpIff(ast.left), elimImpIff(ast.right));
    case "ForAll": return ForAll(ast.v, elimImpIff(ast.sub));
    case "Exists": return Exists(ast.v, elimImpIff(ast.sub));
    default: return ast;
  }
}

// ---------- NNF ----------
function nnf(ast) {
  switch (ast.type) {
    case "Not": { const s = ast.sub; switch (s.type) { case "Not": return nnf(s.sub); case "And": return Or(nnf(Not(s.left)), nnf(Not(s.right))); case "Or": return And(nnf(Not(s.left)), nnf(Not(s.right))); case "ForAll": return Exists(s.v, nnf(Not(s.sub))); case "Exists": return ForAll(s.v, nnf(Not(s.sub))); default: return Not(nnf(s)); } }
    case "And": return And(nnf(ast.left), nnf(ast.right));
    case "Or": return Or(nnf(ast.left), nnf(ast.right));
    case "ForAll": return ForAll(ast.v, nnf(ast.sub));
    case "Exists": return Exists(ast.v, nnf(ast.sub));
    default: return ast;
  }
}

// ---------- Pull quantifiers to prefix (prenex) ----------
function pullQuantifiers(ast) {
  switch (ast.type) {
    case 'ForAll': { const sub = pullQuantifiers(ast.sub); return { prefix: [{ t: 'FORALL', v: ast.v }, ...sub.prefix], matrix: sub.matrix }; }
    case 'Exists': { const sub = pullQuantifiers(ast.sub); return { prefix: [{ t: 'EXISTS', v: ast.v }, ...sub.prefix], matrix: sub.matrix }; }
    case 'And': { const L = pullQuantifiers(ast.left); const R = pullQuantifiers(ast.right); return { prefix: [...L.prefix, ...R.prefix], matrix: And(L.matrix, R.matrix) }; }
    case 'Or': { const L = pullQuantifiers(ast.left); const R = pullQuantifiers(ast.right); return { prefix: [...L.prefix, ...R.prefix], matrix: Or(L.matrix, R.matrix) }; }
    case 'Not': { const S = pullQuantifiers(ast.sub); return { prefix: S.prefix, matrix: Not(S.matrix) }; }
    default: return { prefix: [], matrix: ast };
  }
}
function buildPrenex(prefix, matrix) { let out = matrix; for (let i = prefix.length - 1; i >= 0; i--) { const q = prefix[i]; out = (q.t === 'FORALL') ? ForAll(q.v, out) : Exists(q.v, out); } return out; }
function prefixToLatex(prefix) { if (!prefix.length) return ""; return prefix.map(q => q.t === 'FORALL' ? `\\forall ${q.v}` : `\\exists ${q.v}`).join(' '); }

// ---------- CNF / DNF robust conversion (AST-level distribution) ----------
function isLiteral(a) { return a.type === "Pred" || (a.type === "Not" && a.sub && a.sub.type === "Pred"); }
function distributeOr(a, b) { if (a.type === "And") return And(distributeOr(a.left, b), distributeOr(a.right, b)); if (b.type === "And") return And(distributeOr(a, b.left), distributeOr(a, b.right)); return Or(a, b); }
function toCNFAST(ast) { switch (ast.type) { case "And": return And(toCNFAST(ast.left), toCNFAST(ast.right)); case "Or": { const L = toCNFAST(ast.left); const R = toCNFAST(ast.right); return distributeOr(L, R); } default: return ast; } }
function distributeAnd(a, b) { if (a.type === "Or") return Or(distributeAnd(a.left, b), distributeAnd(a.right, b)); if (b.type === "Or") return Or(distributeAnd(a, b.left), distributeAnd(a, b.right)); return And(a, b); }
function toDNFAST(ast) { switch (ast.type) { case "Or": return Or(toDNFAST(ast.left), toDNFAST(ast.right)); case "And": { const L = toDNFAST(ast.left); const R = toDNFAST(ast.right); return distributeAnd(L, R); } default: return ast; } }

// ---------- flatten CNF/DNF AST to matrix of literals ----------
function litFromAst(a) { if (a.type === "Pred") return { neg: false, atom: a }; if (a.type === "Not" && a.sub && a.sub.type === "Pred") return { neg: true, atom: a.sub }; throw new Error("Esperado literal"); }
function flattenCNF(ast) { if (isLiteral(ast)) return [[litFromAst(ast)]]; if (ast.type === "And") return [...flattenCNF(ast.left), ...flattenCNF(ast.right)]; if (ast.type === "Or") { const gather = (node) => { if (isLiteral(node)) return [litFromAst(node)]; if (node.type === "Or") return [...gather(node.left), ...gather(node.right)]; throw new Error("Disjunção contém estrutura não literal"); }; return [gather(ast)]; } throw new Error("Estrutura inesperada ao linearizar CNF"); }
function flattenDNF(ast) { if (isLiteral(ast)) return [[litFromAst(ast)]]; if (ast.type === "Or") return [...flattenDNF(ast.left), ...flattenDNF(ast.right)]; if (ast.type === "And") { const combine = (node) => { if (isLiteral(node)) return [[litFromAst(node)]]; if (node.type === "And") { const A = combine(node.left); const B = combine(node.right); const out = []; for (const a of A) for (const b of B) out.push([...a, ...b]); return out; } throw new Error("Conjunção contém estrutura não literal"); }; return combine(ast); } throw new Error("Estrutura inesperada ao linearizar DNF"); }

// ---------- Skolemização (prenex AST -> quantifier-free matrix with Skolem terms) ----------
function skolemize(prenexAst) {
  const qlist = []; let mat = prenexAst; while (mat && (mat.type === "ForAll" || mat.type === "Exists")) { qlist.push({ q: mat.type === "ForAll" ? "A" : "E", v: mat.v }); mat = mat.sub; }
  const universals = [];
  let current = mat;
  for (const q of qlist) {
    if (q.q === "A") universals.push(q.v);
    else {
      const skName = fresh("Sk");
      const skTerm = universals.length === 0 ? FuncT(skName, []) : FuncT(skName, universals.map(u => VarT(u)));
      current = substituteVar(current, q.v, skTerm);
    }
  }
  return current; // quantifier-free matrix
}

// ---------- Horn check ----------
function checkHornClause(clauses) { return clauses.every(cl => cl.filter(l => !l.neg).length <= 1); }

// ---------- LaTeX conversion helpers ----------
function termToLatex(t) { if (t.t === "Var") return t.name; const args = t.args.map(termToLatex).join(","); return `${t.name}(${args})`; }
function predToLatex(p) { const args = p.args.length ? `(${p.args.map(termToLatex).join(",")})` : ""; return `${p.name}${args}`; }
function literalToLatex(l) { return l.neg ? `\\neg ${predToLatex(l.atom)}` : predToLatex(l.atom); }
function clausesToLatex(clauses) { if (!clauses.length) return "\\top"; return clauses.map(cl => `\\left(${cl.map(literalToLatex).join(" \\lor ")}\\right)`).join(" \\land "); }
function dnfToLatex(terms) { if (!terms.length) return "\\bot"; return terms.map(t => `\\left(${t.map(literalToLatex).join(" \\land ")}\\right)`).join(" \\lor "); }
function astToLatex(ast) { if (!ast) return "?"; switch (ast.type) { case "Pred": return predToLatex(ast); case "Not": return `\\neg(${astToLatex(ast.sub)})`; case "And": return `(${astToLatex(ast.left)} \\land ${astToLatex(ast.right)})`; case "Or": return `(${astToLatex(ast.left)} \\lor ${astToLatex(ast.right)})`; case "Imp": return `(${astToLatex(ast.left)} \\to ${astToLatex(ast.right)})`; case "Iff": return `(${astToLatex(ast.left)} \\leftrightarrow ${astToLatex(ast.right)})`; case "ForAll": return `\\forall ${ast.v}. ${astToLatex(ast.sub)}`; case "Exists": return `\\exists ${ast.v}. ${astToLatex(ast.sub)}`; default: return "?"; } }

// ---------- MathJax render helper ----------
function renderMath(element, latexString) { if (!element) return; element.innerHTML = `\\(${latexString}\\)`; if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([element]).catch(e=>console.error('MathJax',e)); else setTimeout(()=>{ if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([element]); },200); }
function setPlainText(el, txt) { if (!el) return; el.textContent = txt; }

// ---------- UI wiring (exibição dos passos) ----------
document.addEventListener("DOMContentLoaded", ()=>{
  const formulaInput = document.getElementById('formula-input');
  const processButton = document.getElementById('process-button');
  const originalOutput = document.getElementById('original-formula');
  const renameOutput = document.getElementById('rename-result');
  const elimOutput = document.getElementById('elim-result');
  const nnfOutput = document.getElementById('nnf-result');
  const prenexOutput = document.getElementById('prenex-result');
  const fncpOutput = document.getElementById('fncp-result');
  const fndpOutput = document.getElementById('fndp-result');
  const clausalOutput = document.getElementById('clausal-result');
  const hornOutput = document.getElementById('horn-result');
  const errorEl = document.getElementById('error');

  document.getElementById('example-1')?.addEventListener('click', ()=> formulaInput.value = "(A \\lor B) \\to C");
  document.getElementById('example-2')?.addEventListener('click', ()=> formulaInput.value = "(\\neg P \\land Q) \\leftrightarrow R");
  document.getElementById('example-3')?.addEventListener('click', ()=> formulaInput.value = "\\forall x (P(x) \\land \\exists y Q(y)) \\to R");

  processButton?.addEventListener('click', ()=>{
    const raw = (formulaInput.value || "").trim();
    if (!raw) { alert('Por favor, digite uma fórmula em LaTeX.'); return; }
    // limpar
    [originalOutput, renameOutput, elimOutput, nnfOutput, prenexOutput, fncpOutput, fndpOutput, clausalOutput].forEach(e=>{ if(e) e.innerHTML = ''; });
    if(hornOutput) hornOutput.textContent = '';
    if(errorEl) errorEl.textContent = '';
    gensym = 0;
    try {
      // parse
      const ast0 = parse(raw);
      renderMath(originalOutput, astToLatex(ast0));

      // rename bound
      const ast1 = renameBound(ast0); renderMath(renameOutput, astToLatex(ast1));

      // elimImpIff
      const ast2 = elimImpIff(ast1); renderMath(elimOutput, astToLatex(ast2));

      // nnf
      const ast3 = nnf(ast2); renderMath(nnfOutput, astToLatex(ast3));

      // prenex extraction
      const pq = pullQuantifiers(ast3);
      const prenexAst = buildPrenex(pq.prefix, pq.matrix);
      const prefixLatex = prefixToLatex(pq.prefix);
      renderMath(prenexOutput, (prefixLatex? (prefixLatex + '. \\; '): '') + astToLatex(pq.matrix));

      // FNCP: apply CNF distribution on matrix then flatten
      const cnfAst = toCNFAST(pq.matrix);
      const cnfClauses = flattenCNF(cnfAst);
      renderMath(fncpOutput, (prefixLatex? (prefixLatex + '. \\; '): '') + clausesToLatex(cnfClauses));

      // FNDP: apply DNF distribution then flatten (cuidado com explosao)
      function countNodes(a) { if(!a) return 0; if(a.type === 'Pred' || (a.type==='Not' && a.sub && a.sub.type==='Pred')) return 1; if(a.type==='Not') return 1 + countNodes(a.sub); return 1 + countNodes(a.left||a.sub) + countNodes(a.right||0); }
      const approx = countNodes(pq.matrix);
      if (approx > 220) {
        renderMath(fndpOutput, `\\text{Fórmula grande (≈${approx}) — DNF pode explodir.}`);
      } else {
        const dnfAst = toDNFAST(pq.matrix);
        const dnfTerms = flattenDNF(dnfAst);
        renderMath(fndpOutput, (prefixLatex? (prefixLatex + '. \\; '): '') + dnfToLatex(dnfTerms));
      }

      // Forma clausal: skolemize prenexAst -> NNF -> CNF AST -> clauses
      const skMat = skolemize(prenexAst);
      const skNNF = nnf(skMat);
      const skCNFAST = toCNFAST(skNNF);
      const skClauses = flattenCNF(skCNFAST);
      renderMath(clausalOutput, clausesToLatex(skClauses));
      const isHorn = checkHornClause(skClauses);
      setPlainText(hornOutput, isHorn? 'Sim — cada cláusula tem ≤ 1 literal positivo.' : 'Não — existe cláusula com ≥ 2 literais positivos.');

    } catch (err) {
      console.error(err);
      if (errorEl) errorEl.textContent = `Erro: ${err.message || String(err)} (veja console para detalhes).`; else alert(`Erro: ${err.message || String(err)}`);
    }
  });
});
