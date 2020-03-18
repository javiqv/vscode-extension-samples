// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	const notes = /** @type {HTMLElement} */ (document.querySelector('.notes'));

	const add = document.querySelector('.add-button');
	add.querySelector('button').addEventListener('click', () => {
		vscode.postMessage({
			type: 'add'
		});
	})

	const error = document.createElement('div');
	document.body.appendChild(error);
	error.className = 'error'
	error.style.display = 'none'

	function updateContent(/** @type {string} */ text) {
		let json;
		try {
			json = JSON.parse(text);
		} catch {
			notes.style.display = 'none';
			error.innerText = 'Error: Document is not valid json';
			error.style.display = '';
			return;
		}
		notes.style.display = '';
		error.style.display = 'none';

		// Reset
		notes.innerHTML = '';

		// Render notes
		for (const note of json.scratches || []) {
			const element = document.createElement('div');
			element.className = 'note';
			notes.appendChild(element);

			const text = document.createElement('div');
			text.className = 'text';
			const textContent = document.createElement('span');
			textContent.innerText = note.text;
			text.appendChild(textContent);
			element.appendChild(text);

			const created = document.createElement('div');
			created.className = 'created';
			created.innerText = new Date(note.created).toUTCString();
			element.appendChild(created);

			const deleteButton = document.createElement('button');
			deleteButton.className = 'delete-button';
			element.appendChild(deleteButton);

			deleteButton.addEventListener('click', (e) => {
				vscode.postMessage({
					type: 'delete',
					id: note.id,
				});
			});
		}

		notes.appendChild(add);
	}

	// Handle messages sent from the extension to the webview
	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.type) {
			case 'update':
				updateContent(message.text);
				vscode.setState({ text: message.text });
				break;
		}
	});

	// Webviews are normally torn down when not visible and re-created when they become visible again.
	// State lets us save information across these re-loads
	const state = vscode.getState();
	if (state) {
		updateContent(state.text);
	}
}());