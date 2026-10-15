import * as vscode from 'vscode'
import { debounce } from './editorDebounce'
import { colorize, shuffleSymbolAtCursor, clearColorOverrides } from './colorize'
import { updateConfiguration, shuffleSeed } from './configuration'
import { generatePalette } from "./configuration"

const colorizeIfNeeded = debounce((editor: vscode.TextEditor) => colorize(editor), 200)

interface SemanticToken {
	name: string
	range: vscode.Range
}

function handleVisibleEditorsChange(editors: readonly vscode.TextEditor[]) {
	editors.forEach(editor => {
		colorizeIfNeeded(editor)
	})
}

function handleColorThemeChange() {
	generatePalette()
	const editors = vscode.window.visibleTextEditors
	editors.forEach(editor => {
		colorizeIfNeeded(editor)
	})
}

function handleTextDocumentChange(event: vscode.TextDocumentChangeEvent) {
	const editor = vscode.window.activeTextEditor
	if (editor != null && editor.document === event.document) {
		colorizeIfNeeded(editor)
	}
}

async function recolorAll() {
	// One editor at a time: colorize() keeps shared state while it runs.
	for (const editor of vscode.window.visibleTextEditors) {
		await colorize(editor)
	}
}

async function shuffleColors() {
	shuffleSeed()
	await recolorAll()
}

async function shuffleVariableColor() {
	const editor = vscode.window.activeTextEditor
	if (editor == null) { return }
	const name = await shuffleSymbolAtCursor(editor)
	if (name === undefined) {
		vscode.window.showInformationMessage('Put the text cursor on a variable name that has a color.')
		return
	}
	await recolorAll()
}

async function resetVariableColors() {
	clearColorOverrides()
	await recolorAll()
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('colorIdentifiersMode.shuffleColors', shuffleColors))
	context.subscriptions.push(vscode.commands.registerCommand('colorIdentifiersMode.shuffleVariableColor', shuffleVariableColor))
	context.subscriptions.push(vscode.commands.registerCommand('colorIdentifiersMode.resetVariableColors', resetVariableColors))
	updateConfiguration()
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(updateConfiguration))
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(handleVisibleEditorsChange))
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleTextDocumentChange))
	context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(handleColorThemeChange))

	const editors = vscode.window.visibleTextEditors
	editors.forEach(editor => {
		colorizeIfNeeded(editor)
	})
}

export function deactivate() {}
