import * as vscode from 'vscode'
import { pushValue } from './pushValue'
import { regexIgnoredNames } from './configuration'

const TYPES = 'int|float|vector2|vector4|vector|matrix2|matrix3|matrix|string|dict|bsdf|void|struct'
const TYPE_WORD = new RegExp(`^(?:${TYPES})$`)
// Declaration: a type, optional [], then a name. Covers "float a", "vector[] pts", "float a, b = 1".
const DECL = new RegExp(`\\b(?:${TYPES})\\s*(?:\\[\\])?\\s+([A-Za-z_]\\w*)\\b(?!\\s*\\()`, 'g')
// Extra names in a comma list on the same declaration, e.g. "float a, b, c;"
const DECL_LINE = new RegExp(`\\b(?:${TYPES})\\s*(?:\\[\\])?\\s+([^;(){}]*)`, 'g')
// Attribute: optional type prefix, "@", then a name. Example: v@P, f@mass, @Cd.
const ATTR = /(?<![\w@])(?:[fvpu234sdi]|[fvi]\[\]|s\[\])?@([A-Za-z_]\w*)/g

/** Replace comments and string contents with spaces. Line and column positions stay the same. */
function blank(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
		.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
		.replace(/"(?:\\.|[^"\\\n])*"/g, m => '"' + ' '.repeat(m.length - 2) + '"')
}

export function regexRanges(editor: vscode.TextEditor): Record<string, vscode.Range[]> {
	const doc = editor.document
	const text = blank(doc.getText())
	const accumulator: Record<string, vscode.Range[]> = {}

	const locals = new Set<string>()
	let m: RegExpExecArray | null
	while ((m = DECL.exec(text)) !== null) { locals.add(m[1]) }
	while ((m = DECL_LINE.exec(text)) !== null) {
		// "float myfunc(" is a function definition, not a variable
		const followedByParen = text[m.index + m[0].length] === '('
		if (followedByParen && !m[1].includes('=')) { continue }
		// split "a = 1, b = foo(x)" on commas and take the first word of each part
		m[1].split(',').forEach(part => {
			const name = /^\s*([A-Za-z_]\w*)/.exec(part)?.[1]
			if (name && !TYPE_WORD.test(name)) { locals.add(name) }
		})
	}
	regexIgnoredNames.forEach(name => locals.delete(name))

	if (locals.size > 0) {
		const names = Array.from(locals).join('|')
		const use = new RegExp(`(?<![\\w@.$])(?:${names})\\b`, 'g')
		while ((m = use.exec(text)) !== null) {
			const start = doc.positionAt(m.index)
			pushValue(accumulator, m[0], new vscode.Range(start, start.translate(0, m[0].length)))
		}
	}

	while ((m = ATTR.exec(text)) !== null) {
		if (regexIgnoredNames.has(m[1])) { continue }
		const nameStart = m.index + m[0].length - m[1].length
		const start = doc.positionAt(nameStart)
		pushValue(accumulator, '@' + m[1], new vscode.Range(start, start.translate(0, m[1].length)))
	}
	return accumulator
}
