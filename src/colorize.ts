import * as vscode from 'vscode'
import * as murmurhash from 'murmurhash'
import { rangesByName } from './rangesByName'
import { regexRanges } from './regexTokens'
import { colors, ignoredLanguages, regexLanguages, method, Method, bigFileSize, seed } from "./configuration"

let rangeLists: vscode.Range[][] = colors.map(_ => [])

// Fixed colors chosen by the user for single names. Key: name. Value: color index.
const colorOverrides = new Map<string, number>()

function colorIndexOfSymbol(symbolName: string, symbolIndex: number): number {
	const override = colorOverrides.get(symbolName)
	if (override !== undefined) { return override % rangeLists.length }
	switch(method) {
		case Method.hash:
			return murmurhash.v3(symbolName, seed) % rangeLists.length
		case Method.sequential:
		default:
			return (symbolIndex + seed) % rangeLists.length
	}
}

type Found =
	| { kind: 'skip' }
	| { kind: 'retry' }
	| { kind: 'ok', ranges: Record<string, vscode.Range[]> }

async function findRanges(editor: vscode.TextEditor): Promise<Found> {
	const uri = editor.document.uri
	if (uri == null || ignoredLanguages.has(editor.document.languageId)) { return { kind: 'skip' } }
	const stat = await vscode.workspace.fs.stat(uri)
	if (stat.size > bigFileSize) { return { kind: 'skip' } }
	const legend: vscode.SemanticTokensLegend | undefined = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', uri)
	const tokensData: vscode.SemanticTokens | undefined = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', uri)
	const hasTokens = tokensData != null && legend != null && tokensData.data.length > 0
	const useRegex = !hasTokens && regexLanguages.has(editor.document.languageId)
	if (!hasTokens && !useRegex) { return { kind: 'retry' } }
	return {
		kind: 'ok',
		ranges: useRegex ? regexRanges(editor) : rangesByName(tokensData!, legend!, editor)
	}
}

export function clearColorOverrides() {
	colorOverrides.clear()
}

/**
 * Gives the name under the text cursor a new fixed color that differs from its current color.
 * Returns the name, or undefined if the cursor is not on a colored name.
 */
export async function shuffleSymbolAtCursor(editor: vscode.TextEditor): Promise<string | undefined> {
	const found = await findRanges(editor)
	if (found.kind !== 'ok') { return undefined }
	const position = editor.selection.active
	const names = Object.keys(found.ranges)
	const name = names.find(n => found.ranges[n].some(range => range.contains(position)))
	if (name === undefined || colors.length < 2) { return undefined }
	rangeLists = colors.map(_ => [])
	const current = colorIndexOfSymbol(name, names.indexOf(name))
	const next = (current + 1 + Math.floor(Math.random() * (colors.length - 1))) % colors.length
	colorOverrides.set(name, next)
	return name
}

export async function colorize(editor: vscode.TextEditor): Promise<boolean> {
	const found = await findRanges(editor)
	if (found.kind === 'skip') { return true }
	rangeLists = colors.map(_ => [])
	if (found.kind === 'retry') { return false }
	const rangesBySymbolName = found.ranges
	Object.keys(rangesBySymbolName).forEach((name, index) => {
		const ranges = rangesBySymbolName[name]
		const colorIndex = colorIndexOfSymbol(name, index)
		rangeLists[colorIndex] = rangeLists[colorIndex].concat(ranges)
	})

	colors.forEach((color, index) => {
		editor.setDecorations(color, rangeLists[index])
	})

	return true
}
