import * as vscode from 'vscode';

export class ResultsProvider implements vscode.TreeDataProvider<AnalysisItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AnalysisItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private analysisResults: any = {};

    /** called by extension to load new results */
    public setResults(results: any) {
        this.analysisResults = results;
    }

    getTreeItem(element: AnalysisItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AnalysisItem): Thenable<AnalysisItem[]> {
        if (!element) {
            return Promise.resolve(this.getAnalysisResults());
        }
        return Promise.resolve([]);
    }

    private getAnalysisResults(): AnalysisItem[] {
        if (!this.analysisResults) {
            return [];
        }
        const items: AnalysisItem[] = [];
        items.push(new AnalysisItem(
            `AI Probability: ${this.analysisResults.ai_probability.toFixed(2)}`,
            vscode.TreeItemCollapsibleState.None
        ));
        for (const bug of this.analysisResults.potential_bugs) {
            items.push(new AnalysisItem(
                `${bug.type}: ${bug.description}`,
                vscode.TreeItemCollapsibleState.None
            ));
        }
        const comp = this.analysisResults.complexity_score;
        items.push(new AnalysisItem(
            `Cyclomatic Complexity: ${comp.cyclomatic_complexity.toFixed(2)}`,
            vscode.TreeItemCollapsibleState.None
        ));
        items.push(new AnalysisItem(
            `Cognitive Complexity: ${comp.cognitive_complexity.toFixed(2)}`,
            vscode.TreeItemCollapsibleState.None
        ));
        for (const fix of this.analysisResults.suggested_fixes) {
            items.push(new AnalysisItem(
                `Fix (${fix.type}): ${fix.fix}`,
                vscode.TreeItemCollapsibleState.None
            ));
        }
        return items;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class AnalysisItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
