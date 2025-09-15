document.addEventListener('DOMContentLoaded', () => {
    // Mapeando os elementos do seu HTML original
    const formulaInput = document.getElementById('formula-input');
    const processButton = document.getElementById('process-button');
    const originalOutput = document.getElementById('original-formula');
    const fncpOutput = document.getElementById('fncp-result');
    const fndpOutput = document.getElementById('fndp-result');
    const clausalOutput = document.getElementById('clausal-result');
    const hornOutput = document.getElementById('horn-result');

    // Mapeamento dos botões de exemplo (se existirem na sua versão)
    const sample1Btn = document.getElementById('sample1');
    const sample2Btn = document.getElementById('sample2');
    if (sample1Btn) {
        sample1Btn.addEventListener("click", () => {
            formulaInput.value = "\\forall x. (R(x) \\to \\exists y. (P(x) \\land Q(y)))";
            processButton.click(); // Simula o clique no botão de processar
        });
    }
    if (sample2Btn) {
        sample2Btn.addEventListener("click", () => {
            formulaInput.value = "(P \\leftrightarrow Q) \\lor \\neg R";
            processButton.click(); // Simula o clique no botão de processar
        });
    }

    // Lógica principal
    processButton.addEventListener('click', () => {
        const formula = formulaInput.value.trim();
        if (formula === "") {
            alert("Por favor, digite uma fórmula em LaTeX.");
            return;
        }

        clearOutputs();
        gensym = 0;

        try {
            // Lógica do parser e transformações, adaptada do código que você enviou
            const originalAst = parse(formula);
            
            // Passo a passo das transformações
            const s1 = renameBound(originalAst);
            const s2 = elimImpIff(s1);
            const s3 = nnf(s2);
            
            // FNDP
            const dnfMatrixAst = dnfMatrix(s3);
            const dnfLatex = dnfToLatex(dnfMatrixAst);
            
            // FNCP
            const cnfMatrixAst = cnfMatrix(s3);
            const cnfLatex = clausesToLatex(cnfMatrixAst);

            // Forma Clausal (após Skolemização)
            const skolemizedAst = skolemize(s3);
            const skolemizedNNF = nnf(skolemizedAst);
            const skolemizedCNF = cnfMatrix(skolemizedNNF);
            const clausalLatex = clausesToLatex(skolemizedCNF);
            
            // Cláusula de Horn
            const isHorn = checkHornClause(skolemizedCNF);

            // Renderiza os resultados
            renderMath(originalOutput, astToLatex(originalAst));
            renderMath(fncpOutput, cnfLatex);
            renderMath(fndpOutput, dnfLatex);
            renderMath(clausalOutput, clausalLatex);
            hornOutput.textContent = isHorn ?
                "Sim — cada cláusula tem ≤ 1 literal positivo." :
                "Não — existe cláusula com ≥ 2 literais positivos.";

        } catch (e) {
            console.error(e);
            alert(`Erro ao processar a fórmula: ${e.message}`);
        }
    });

    // Função para renderizar a fórmula usando MathJax
    function renderMath(element, latexString) {
        if (element && latexString) {
            element.innerHTML = '\\(' + latexString + '\\)';
            MathJax.typesetPromise([element]);
        }
    }

    // Função para limpar todas as áreas de resultado
    function clearOutputs() {
        if (originalOutput) originalOutput.innerHTML = '$$ $$';
        if (fncpOutput) fncpOutput.innerHTML = '$$ $$';
        if (fndpOutput) fndpOutput.innerHTML = '$$ $$';
        if (clausalOutput) clausalOutput.innerHTML = '$$ $$';
        if (hornOutput) hornOutput.textContent = '';
    }

    //
    // LÓGICA DE PARSER E TRANSFORMAÇÃO (adaptada do código que você enviou)
    //

    // --------- Tokenizar & Parser ----------
    const TT = {
        FORALL: "FORALL", EXISTS: "EXISTS", NEG: "NEG", AND: "AND", OR: "OR",
        IMP: "IMP", IFF: "IFF", LPAREN: "LPAREN", RPAREN: "RPAREN", DOT: "DOT",
        COMMA: "COMMA", PRED: "PRED", ID: "ID", EOF: "EOF",
    };

    function tokenize(input) {
        const src = input.replace(/\s+/g, " ").replace(/[{}]/g, "").trim();
        const tokens = [];
        let i = 0;
        const n = src.length;
        const startsWith = (s) => src.slice(i, i + s.length) === s;
        const isLetter = (ch) => /[A-Za-z]/.test(ch);
        const isIdent = (ch) => /[A-Za-z0-9_]/.test(ch);
        while (i < n) {
            const ch = src[i];
            if (ch === " ") { i++; continue; }
            if (startsWith("\\forall")) { tokens.push({ type: TT.FORALL }); i += 7; continue; }
            if (startsWith("\\exists")) { tokens.push({ type: TT.EXISTS }); i += 7; continue; }
            if (startsWith("\\neg")) { tokens.push({ type: TT.NEG }); i += 4; continue; }
            if (startsWith("\\land")) { tokens.push({ type: TT.AND }); i += 5; continue; }
            if (startsWith("\\lor")) { tokens.push({ type: TT.OR }); i += 4; continue; }
            if (startsWith("\\to")) { tokens.push({ type: TT.IMP }); i += 3; continue; }
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
            throw new Error(`Caractere inesperado: '${ch}' em ${i}`);
        }
        tokens.push({ type: TT.EOF });
        return tokens;
    }

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

    function parse(input) {
        const tokens = tokenize(input);
        let k = 0;
        const peek = () => tokens[k];
        const eat = (type) => {
            const t = tokens[k];
            if (t.type !== type) throw new Error(`Esperado ${type} mas obteve ${t.type}`);
            k++;
            return t;
        };
        function parseTerm() {
            const t = peek();
            if (t.type !== TT.ID) throw new Error("Esperado variável/função");
            const id = eat(TT.ID).value;
            if (peek().type === TT.LPAREN) {
                eat(TT.LPAREN);
                const args = [];
                if (peek().type !== TT.RPAREN) {
                    args.push(parseTerm());
                    while (peek().type === TT.COMMA) {
                        eat(TT.COMMA);
                        args.push(parseTerm());
                    }
                }
                eat(TT.RPAREN);
                return FuncT(id, args);
            }
            return VarT(id);
        }
        function parseAtom() {
            const t = peek();
            if (t.type === TT.PRED) {
                eat(TT.PRED);
                if (peek().type === TT.LPAREN) {
                    eat(TT.LPAREN);
                    const args = [];
                    if (peek().type !== TT.RPAREN) {
                        args.push(parseTerm());
                        while (peek().type === TT.COMMA) {
                            eat(TT.COMMA);
                            args.push(parseTerm());
                        }
                    }
                    eat(TT.RPAREN);
                    return Pred(t.value, args);
                }
                return Pred(t.value, []);
            }
            throw new Error("Esperado predicado (ex: P, Q(x))");
        }
        function parseQN() {
            const t = peek();
            if (t.type === TT.FORALL || t.type === TT.EXISTS) {
                const isFor = t.type === TT.FORALL;
                eat(t.type);
                const v = eat(TT.ID).value;
                if (peek().type === TT.DOT) eat(TT.DOT);
                const sub = parseImp();
                return isFor ? ForAll(v, sub) : Exists(v, sub);
            }
            if (t.type === TT.NEG) {
                eat(TT.NEG);
                return Not(parseQN());
            }
            if (t.type === TT.LPAREN) {
                eat(TT.LPAREN);
                const f = parseImp();
                eat(TT.RPAREN);
                return f;
            }
            return parseAtom();
        }
        function parseAnd() {
            let n = parseQN();
            while (peek().type === TT.AND) {
                eat(TT.AND);
                n = And(n, parseQN());
            }
            return n;
        }
        function parseOr() {
            let n = parseAnd();
            while (peek().type === TT.OR) {
                eat(TT.OR);
                n = Or(n, parseAnd());
            }
            return n;
        }
        function parseImp() {
            let n = parseOr();
            while (peek().type === TT.IMP || peek().type === TT.IFF) {
                const t = peek();
                if (t.type === TT.IMP) {
                    eat(TT.IMP);
                    n = Imp(n, parseOr());
                } else {
                    eat(TT.IFF);
                    n = Iff(n, parseOr());
                }
            }
            return n;
        }
        const ast = parseImp();
        if (peek().type !== TT.EOF) throw new Error("Tokens residuais apos parse");
        return ast;
    }

    let gensym = 0;
    function fresh(pref) { return pref + ++gensym; }
    function cloneTerm(t) {
        if (t.t === "Var") return VarT(t.name);
        return FuncT(t.name, t.args.map(cloneTerm));
    }
    function replaceVarInTerm(t, v, repl) {
        if (t.t === "Var") {
            if (t.name === v) return cloneTerm(repl);
            return VarT(t.name);
        }
        return FuncT(t.name, t.args.map((a) => replaceVarInTerm(a, v, repl)));
    }
    function substituteVar(ast, v, repl) {
        switch (ast.type) {
            case "Pred": return Pred(ast.name, ast.args.map((t) => replaceVarInTerm(t, v, repl)));
            case "Not": return Not(substituteVar(ast.sub, v, repl));
            case "And": return And(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
            case "Or": return Or(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
            case "Imp": return Imp(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
            case "Iff": return Iff(substituteVar(ast.left, v, repl), substituteVar(ast.right, v, repl));
            case "ForAll":
                if (ast.v === v) return ForAll(ast.v, ast.sub);
                return ForAll(ast.v, substituteVar(ast.sub, v, repl));
            case "Exists":
                if (ast.v === v) return Exists(ast.v, ast.sub);
                return Exists(ast.v, substituteVar(ast.sub, v, repl));
            default: return ast;
        }
    }

    function renameBound(ast) {
        switch (ast.type) {
            case "ForAll": { const fv = fresh("x"); const sub2 = substituteVar(ast.sub, ast.v, VarT(fv)); return ForAll(fv, renameBound(sub2)); }
            case "Exists": { const fv = fresh("x"); const sub2 = substituteVar(ast.sub, ast.v, VarT(fv)); return Exists(fv, renameBound(sub2)); }
            case "Not": return Not(renameBound(ast.sub));
            case "And": return And(renameBound(ast.left), renameBound(ast.right));
            case "Or": return Or(renameBound(ast.left), renameBound(ast.right));
            case "Imp": return Imp(renameBound(ast.left), renameBound(ast.right));
            case "Iff": return Iff(renameBound(ast.left), renameBound(ast.right));
            default: return ast;
        }
    }

    function elimImpIff(ast) {
        switch (ast.type) {
            case "Imp": return Or(Not(elimImpIff(ast.left)), elimImpIff(ast.right));
            case "Iff": { const a = elimImpIff(ast.left); const b = elimImpIff(ast.right); return And(Or(Not(a), b), Or(Not(b), a)); }
            case "Not": return Not(elimImpIff(ast.sub));
            case "And": return And(elimImpIff(ast.left), elimImpIff(ast.right));
            case "Or": return Or(elimImpIff(ast.left), elimImpIff(ast.right));
            case "ForAll": return ForAll(ast.v, elimImpIff(ast.sub));
            case "Exists": return Exists(ast.v, elimImpIff(ast.sub));
            default: return ast;
        }
    }

    function nnf(ast) {
        switch (ast.type) {
            case "Not": {
                const s = ast.sub;
                switch (s.type) {
                    case "Not": return nnf(s.sub);
                    case "And": return Or(nnf(Not(s.left)), nnf(Not(s.right)));
                    case "Or": return And(nnf(Not(s.left)), nnf(Not(s.right)));
                    case "ForAll": return Exists(s.v, nnf(Not(s.sub)));
                    case "Exists": return ForAll(s.v, nnf(Not(s.sub)));
                    default: return Not(nnf(s));
                }
            }
            case "And": return And(nnf(ast.left), nnf(ast.right));
            case "Or": return Or(nnf(ast.left), nnf(ast.right));
            case "ForAll": return ForAll(ast.v, nnf(ast.sub));
            case "Exists": return Exists(ast.v, nnf(ast.sub));
            default: return ast;
        }
    }

    function isAtom(a) { return a.type === "Pred"; }
    function isLiteral(a) { return isAtom(a) || (a.type === "Not" && isAtom(a.sub)); }
    function litFromAst(a) {
        if (a.type === "Pred") return { neg: false, atom: a };
        if (a.type === "Not" && a.sub.type === "Pred") return { neg: true, atom: a.sub };
        throw new Error("Esperado literal");
    }
    
    // CNF a partir de NNF
    function cnfMatrix(ast) {
        function merge(A, B) {
            const out = [];
            for (const ca of A) for (const cb of B) out.push([...ca, ...cb]);
            return out;
        }
        function toCNF(a) {
            if (isLiteral(a)) return [[litFromAst(a)]];
            if (a.type === "And") {
                const L = toCNF(a.left);
                const R = toCNF(a.right);
                return [...L, ...R];
            }
            if (a.type === "Or") {
                const L = toCNF(a.left);
                const R = toCNF(a.right);
                return merge(L, R);
            }
            throw new Error("Estrutura inesperada para CNF");
        }
        return toCNF(ast);
    }
    
    // DNF a partir de NNF
    function dnfMatrix(ast) {
        function merge(A, B) {
            const out = [];
            for (const a of A) for (const b of B) out.push([...a, ...b]);
            return out;
        }
        function toDNF(a) {
            if (isLiteral(a)) return [[litFromAst(a)]];
            if (a.type === "Or") {
                const L = toDNF(a.left);
                const R = toDNF(a.right);
                return [...L, ...R];
            }
            if (a.type === "And") {
                const L = toDNF(a.left);
                const R = toDNF(a.right);
                return merge(L, R);
            }
            throw new Error("Estrutura inesperada para DNF");
        }
        return toDNF(ast);
    }

    // Skolemização
    function skolemize(nnfAst) {
        let mat = nnfAst;
        const universals = [];
        function process(node) {
            if (node.type === "ForAll") {
                universals.push(node.v);
                return process(node.sub);
            }
            if (node.type === "Exists") {
                const skName = fresh("Sk");
                const skTerm = universals.length === 0 ? FuncT(skName, []) : FuncT(skName, universals.map((u) => VarT(u)));
                return substituteVar(process(node.sub), node.v, skTerm);
            }
            return node;
        }
        return process(mat);
    }

    // Verificação de Cláusula de Horn
    function checkHornClause(clauses) {
        return clauses.every(cl => cl.filter(l => !l.neg).length <= 1);
    }
    
    // Conversores de AST para LaTeX
    function literalToLatex(l) { return l.neg ? `\\neg ${predToLatex(l.atom)}` : predToLatex(l.atom); }
    function predToLatex(p) {
        const args = p.args.length ? `(${p.args.map(termToLatex).join(",")})` : "";
        return `${p.name}${args}`;
    }
    function termToLatex(t) {
        if (t.t === "Var") return t.name;
        const args = t.args.map(termToLatex).join(",");
        return `${t.name}(${args})`;
    }
    function clausesToLatex(clauses) {
        if (!clauses.length) return "\\top";
        return clauses.map((cl) => `\\left(${cl.map(literalToLatex).join(" \\lor ")}\\right)`).join(" \\land ");
    }
    function dnfToLatex(terms) {
        if (!terms.length) return "\\bot";
        return terms.map((t) => `\\left(${t.map(literalToLatex).join(" \\land ")}\\right)`).join(" \\lor ");
    }
    function astToLatex(ast) {
        switch (ast.type) {
            case "Pred": return predToLatex(ast);
            case "Not": return `\\neg(${astToLatex(ast.sub)})`;
            case "And": return `(${astToLatex(ast.left)} \\land ${astToLatex(ast.right)})`;
            case "Or": return `(${astToLatex(ast.left)} \\lor ${astToLatex(ast.right)})`;
            case "Imp": return `(${astToLatex(ast.left)} \\to ${astToLatex(ast.right)})`;
            case "Iff": return `(${astToLatex(ast.left)} \\leftrightarrow ${astToLatex(ast.right)})`;
            case "ForAll": return `\\forall ${ast.v}. ${astToLatex(ast.sub)}`;
            case "Exists": return `\\exists ${ast.v}. ${astToLatex(ast.sub)}`;
            default: return "?";
        }
    }
});