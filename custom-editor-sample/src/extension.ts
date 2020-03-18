import * as vscode from 'vscode';
import { CatScratchEditorProvider } from './catScratchEditor';
import { PawDrawEditorProvider } from './pawDrawEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			CatScratchEditorProvider.viewType,
			new CatScratchEditorProvider(context)));
	
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			PawDrawEditorProvider.viewType,
			new PawDrawEditorProvider(context)));
}
