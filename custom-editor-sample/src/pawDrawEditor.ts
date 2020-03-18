import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from './util';

/**
 * Define the the type of edits to the file
 */
interface Edit {
	readonly color: string;
	readonly stroke: ReadonlyArray<[number, number]>;
}

/**
 * 
 */
type PawEditDocument = vscode.CustomDocument<{
	readonly edits: Edit[];
	readonly initialContent: Uint8Array;
}>;

/**
 * Provider for paw draw editors.
 * 
 * Cat scratch editors are used for `.pawDraw` files, which are just png files with a different file extension
 * 
 * This provider demonstrates:
 * 
 * - Setting up the initial webview for a custom editor.
 * - Loading scripts and styles in a custom editor.
 * - Communication between VS Code and the custom editor.
 * - Using CustomDocuments to store information that is shared between multiple custom editors.
 * - Implementing save, undo, redo, and revert.
 * - Backing up a custom editor.
 */
export class PawDrawEditorProvider implements vscode.CustomEditorProvider, vscode.CustomEditorEditingDelegate<Edit> {
	public static readonly viewType = 'catEdit.pawDraw';

	private readonly _allWebviews = new Map<string, Set<vscode.WebviewPanel>>();

	constructor(
		private readonly _context: vscode.ExtensionContext
	) { }

	// By setting an `editingDelegate`, we enable editing for our custom editor.
	public readonly editingDelegate = this;

	async resolveCustomDocument(
		document: PawEditDocument,
		token: vscode.CancellationToken
	): Promise<void> {
		//
		const fileData = await vscode.workspace.fs.readFile(document.uri);

		document.userData = {
			initialContent: fileData,
			edits: [],
		};
	}

	async resolveCustomEditor(
		document: PawEditDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		const webviews = this._allWebviews.get(document.uri.toString()) || new Set();
		webviews.add(webviewPanel);
		this._allWebviews.set(document.uri.toString(), webviews);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.onDidDispose(() => {
			this._allWebviews.get(document.uri.toString())?.delete(webviewPanel);
		});

		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage(e => {
			switch (e.type) {
				case 'stroke':
					this._onDidEdit.fire({
						document,
						edit: e,
						label: "Stroke"
					});
					return;
			}
		});

		setTimeout(() => {
			webviewPanel.webview.postMessage({
				type: 'init',
				value: document.userData?.initialContent
			});
		}, 100);
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.file(
			path.join(this._context.extensionPath, 'media', 'pawDraw.js')
		));
		const styleUri = webview.asWebviewUri(vscode.Uri.file(
			path.join(this._context.extensionPath, 'media', 'pawDraw.css')
		));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleUri}" rel="stylesheet" />

				<title>Paw Draw</title>
			</head>
			<body>
				<div class="drawing"></div>

				<div class="controls">
					<button data-color="black" class="black active" title="Black"></button>
					<button data-color="white" class="white" title="White"></button>
					<button data-color="red" class="red" title="Red"></button>
					<button data-color="green" class="green" title="Green"></button>
					<button data-color="blue" class="blue" title="Blue"></button>
				</div>
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	// #region CustomEditorEditingDelegate

	private readonly _onDidEdit = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<Edit>>();
	public readonly onDidEdit = this._onDidEdit.event;

	async save(document: PawEditDocument, cancellation: vscode.CancellationToken): Promise<void> {
		throw new Error("Method not implemented.");
	}

	async saveAs(document: PawEditDocument, targetResource: vscode.Uri): Promise<void> {
		throw new Error("Method not implemented.");
	}

	async applyEdits(document: PawEditDocument, edits: readonly Edit[]): Promise<void> {
		document.userData?.edits.push(...edits);
		this.updateWebviews(document);
	}

	async undoEdits(document: PawEditDocument, edits: readonly Edit[]): Promise<void> {
		for (const _ of edits) {
			document.userData?.edits.pop();
		}
		this.updateWebviews(document);
	}

	async revert(document: PawEditDocument, edits: vscode.CustomDocumentRevert<Edit>): Promise<void> {
		throw new Error("Method not implemented.");
	}

	async backup(document: PawEditDocument, cancellation: vscode.CancellationToken): Promise<void> {
		throw new Error("Method not implemented.");
	}

	// #endregion

	public updateWebviews(document: PawEditDocument) {
		for (const webviewPanel of this._allWebviews.get(document.uri.toString()) || []) {
			webviewPanel.webview.postMessage({
				type: 'update',
				edits: document.userData?.edits,
			});
		}
	}
}
