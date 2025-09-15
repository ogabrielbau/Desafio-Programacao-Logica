document.addEventListener('DOMContentLoaded', () => {
    const formulaInput = document.getElementById('formula-input');
    const processButton = document.getElementById('process-button');
    const originalOutput = document.getElementById('original-formula');
    const fncpOutput = document.getElementById('fncp-result');
    const fndpOutput = document.getElementById('fndp-result');
    const clausalOutput = document.getElementById('clausal-result');
    const hornOutput = document.getElementById('horn-result');

    processButton.addEventListener('click', () => {
        const formula = formulaInput.value.trim();
        if (formula === "") {
            alert("Por favor, digite uma fórmula em LaTeX.");
            return;
        }

        clearOutputs();

        // 1. Renderizar a fórmula original
        renderMath(originalOutput, formula);

        // 2. Aplicar a primeira etapa da transformação (Eliminar Implicações)
        const step1Formula = eliminateImplications(formula);

        // 3. Chamar as próximas transformações com a fórmula modificada
        const fncpFormula = transformToFNCP(step1Formula);
        const fndpFormula = transformToFNDP(step1Formula);
        const clausalFormula = transformToClausal(fncpFormula);
        const hornCheck = checkHornClause(clausalFormula);

        // 4. Renderizar os resultados das transformações
        renderMath(fncpOutput, fncpFormula);
        renderMath(fndpOutput, fndpFormula);
        renderMath(clausalOutput, clausalFormula);
        hornOutput.textContent = hornCheck;
    });

    // Função para renderizar a fórmula usando MathJax
    function renderMath(element, latexString) {
        if (latexString) {
            element.innerHTML = '\\(' + latexString + '\\)';
            MathJax.typesetPromise([element]).then(() => {
                console.log('MathJax typeset concluído para', latexString);
            });
        }
    }

    // Função para limpar todas as áreas de resultado
    function clearOutputs() {
        originalOutput.innerHTML = '';
        fncpOutput.innerHTML = '';
        fndpOutput.innerHTML = '';
        clausalOutput.innerHTML = '';
        hornOutput.textContent = '';
    }

    /**
     * **PASSO A PASSO:** ELIMINAR IMPLICAÇÕES
     * Esta função substitui todas as ocorrências de A \rightarrow B por \neg A \lor B.
     * Esta é uma versão MUITO SIMPLIFICADA e não lida com parênteses ou expressões complexas.
     * @param {string} formula
     * @returns {string} Fórmula sem implicações.
     */
    function eliminateImplications(formula) {
        // Exemplo de uma regra simples: A \rightarrow B  vira \neg A \vee B
        // Para a fórmula \forall x (P(x) \rightarrow Q(x))
        // Esta função irá retornar \forall x (\neg P(x) \vee Q(x))
        return formula.replace(/(\\rightarrow)/g, '\\vee \\neg');
    }

    //
    // A LÓGICA DE TRANSFORMAÇÃO COMPLETA DEVE SER IMPLEMENTADA ABAIXO
    //

    function transformToFNCP(formula) {
        // Agora você trabalha com a fórmula já sem implicações
        // Implemente a próxima etapa aqui (e.g., De Morgan)
        // Por enquanto, retornamos um placeholder
        console.log("Transformando para FNCP:", formula);
        return formula; // Por enquanto, apenas retorna a fórmula modificada
    }

    function transformToFNDP(formula) {
        console.log("Transformando para FNDP:", formula);
        return "Implementação em andamento...";
    }

    function transformToClausal(formulaFNCP) {
        console.log("Transformando para Forma Cláusal:", formulaFNCP);
        return "Implementação em andamento...";
    }

    function checkHornClause(formulaClausal) {
        console.log("Verificando se é Cláusula de Horn:", formulaClausal);
        return "Verificação em andamento...";
    }
});