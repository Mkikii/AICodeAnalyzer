import * as vscode from 'vscode';

export class ResultsProvider implements vscode.TreeDataProvider<AnalysisItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AnalysisItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private analysisResults: any = {};
    private lastFilePath: string = '';

    /** called by extension to load new results */
    public setResults(results: any, filePath: string = '') {
        this.analysisResults = results;
        this.lastFilePath = filePath;
    }

    /** Get the path of the last analyzed file */
    public getLastFilePath(): string {
        return this.lastFilePath;
    }

    getTreeItem(element: AnalysisItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AnalysisItem): Thenable<AnalysisItem[]> {
        if (!element) {
            return Promise.resolve(this.getAnalysisResults());
        }

        // If this is a parent item with children, return them
        if (element.children && element.children.length > 0) {
            return Promise.resolve(element.children);
        }

        return Promise.resolve([]);
    }

    private getFixableIssuesCount(): number {
        if (!this.analysisResults?.potential_bugs) {
            return 0;
        }

        return this.analysisResults.potential_bugs.filter((bug: any) => {
            // Count only issues we know we can fix
            return bug.type === 'security_issue' ||
                   bug.type === 'error_handling' ||
                   bug.type === 'comparison' ||
                   bug.type === 'api_misuse';
        }).length;
    }

    public getAnalysisResults(): AnalysisItem[] {
        if (!this.analysisResults) {
            return [];
        }

        const items: AnalysisItem[] = [];

        // Add file name if available
        if (this.lastFilePath) {
            const fileName = this.lastFilePath.split(/[/\\]/).pop() || '';
            items.push(new AnalysisItem(
                `File: ${fileName}`,
                vscode.TreeItemCollapsibleState.None,
                {
                    tooltip: this.lastFilePath,
                    iconPath: new vscode.ThemeIcon('file')
                }
            ));
        }

        // AI probability with color indication
        const aiProb = this.analysisResults.ai_probability || 0;
        let probIcon: vscode.ThemeIcon;
        let probLabel = `AI Probability: ${aiProb.toFixed(2)}`;

        if (aiProb > 0.8) {
            probIcon = new vscode.ThemeIcon('alert', new vscode.ThemeColor('errorForeground'));
            probLabel = `${probLabel} (Very Likely AI-Generated)`;
        } else if (aiProb > 0.5) {
            probIcon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            probLabel = `${probLabel} (Likely AI-Generated)`;
        } else {
            probIcon = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
            probLabel = `${probLabel} (Likely Human-Written)`;
        }

        items.push(new AnalysisItem(
            probLabel,
            vscode.TreeItemCollapsibleState.None,
            { iconPath: probIcon }
        ));

        // Group potential bugs
        if (this.analysisResults.potential_bugs && this.analysisResults.potential_bugs.length > 0) {
            const bugChildren = this.analysisResults.potential_bugs.map((bug: any) => {
                const message = bug.description;
                let icon: vscode.ThemeIcon;

                if (bug.type === 'security_issue') {
                    icon = new vscode.ThemeIcon('shield', new vscode.ThemeColor('errorForeground'));
                } else if (bug.type === 'error_handling') {
                    icon = new vscode.ThemeIcon('warning');
                } else {
                    icon = new vscode.ThemeIcon('info');
                }

                const lineInfo = bug.line ? ` (line ${bug.line})` : '';

                return new AnalysisItem(
                    `${message}${lineInfo}`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        iconPath: icon,
                        command: bug.line ? {
                            command: 'ai-code-detective.goToLine',
                            title: 'Go to Line',
                            arguments: [this.lastFilePath, bug.line]
                        } : undefined
                    }
                );
            });

            // Add "Fix All Issues" button at the top of the issues section, only if there are fixable issues
            const fixableCount = this.getFixableIssuesCount();
            if (fixableCount > 0) {
                bugChildren.unshift(new AnalysisItem(
                    `Fix ${fixableCount} Issue${fixableCount === 1 ? '' : 's'} 🛠`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        iconPath: new vscode.ThemeIcon('tools'),
                        command: {
                            command: 'ai-code-detective.fixAllIssues',
                            title: 'Fix All AI Issues',
                            arguments: [this.lastFilePath]
                        },
                        contextValue: 'fixAllIssues',
                        tooltip: `Click to automatically fix ${fixableCount} issue${fixableCount === 1 ? '' : 's'}`
                    }
                ));
            }

            items.push(new AnalysisItem(
                `Potential Issues (${bugChildren.length - 1})`, // -1 to exclude the Fix All button
                vscode.TreeItemCollapsibleState.Expanded,
                { children: bugChildren }
            ));
        }

        // Add complexity information
        const comp = this.analysisResults.complexity_score || { cyclomatic_complexity: 0, cognitive_complexity: 0 };
        const complexityChildren = [];

        complexityChildren.push(new AnalysisItem(
            `Cyclomatic: ${comp.cyclomatic_complexity.toFixed(2)}`,
            vscode.TreeItemCollapsibleState.None
        ));

        complexityChildren.push(new AnalysisItem(
            `Cognitive: ${comp.cognitive_complexity.toFixed(2)}`,
            vscode.TreeItemCollapsibleState.None
        ));

        items.push(new AnalysisItem(
            'Code Complexity',
            vscode.TreeItemCollapsibleState.Collapsed,
            { children: complexityChildren }
        ));

        // Add suggested fixes
        if (this.analysisResults.suggested_fixes && this.analysisResults.suggested_fixes.length > 0) {
            const fixChildren = this.analysisResults.suggested_fixes.map((fix: any) => {
                return new AnalysisItem(
                    fix.fix,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        iconPath: new vscode.ThemeIcon('lightbulb'),
                        contextValue: 'aiSuggestion'
                    }
                );
            });

            items.push(new AnalysisItem(
                'Suggested Fixes',
                vscode.TreeItemCollapsibleState.Collapsed,
                { children: fixChildren }
            ));
        }

        return items;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

interface AnalysisItemOptions {
    tooltip?: string;
    iconPath?: vscode.ThemeIcon;
    children?: AnalysisItem[];
    command?: vscode.Command;
    contextValue?: string;
}

class AnalysisItem extends vscode.TreeItem {
    public children?: AnalysisItem[];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        options: AnalysisItemOptions = {}
    ) {
        super(label, collapsibleState);

        if (options.tooltip) {
            this.tooltip = options.tooltip;
        }

        if (options.iconPath) {
            this.iconPath = options.iconPath;
        }

        if (options.children) {
            this.children = options.children;
        }

        if (options.command) {
            this.command = options.command;
        }

        if (options.contextValue) {
            this.contextValue = options.contextValue;
        }
    }
}
