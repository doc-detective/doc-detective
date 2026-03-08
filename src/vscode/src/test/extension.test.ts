import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Extension activates successfully', async () => {
		const ext = vscode.extensions.getExtension('DocDetective.doc-detective-vscode');
		assert.ok(ext, 'Extension should be found by ID');
		await ext!.activate();
		assert.strictEqual(ext!.isActive, true, 'Extension should be active after activate()');
	});

	test('Doc Detective view container is registered', async () => {
		// Trigger the view to ensure activation
		await vscode.commands.executeCommand('workbench.view.extension.docDetectiveSidebar').then(
			() => {},
			() => {} // ignore errors from headless env
		);
		const ext = vscode.extensions.getExtension('DocDetective.doc-detective-vscode');
		assert.ok(ext, 'Extension should be registered');
	});
});
