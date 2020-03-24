// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	 * A drawn line.
	 */
	class Stroke {
		constructor(/** @type {string} */ color, /** @type {Array<[number, number]> | undefined} */ stroke) {
			this.color = color;
			/** @type {Array<[number, number]>} */
			this.stroke = stroke || [];
		}

		addPoint(/** @type {number} */ x, /** @type {number} */ y) {
			this.stroke.push([x, y])
		}
	}

	/**
	 * @param {Uint8Array} initialContent 
	 * @return {Promise<HTMLImageElement>}
	 */
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { 'type': 'image/png' });
		const url = URL.createObjectURL(blob);
		try {
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	class Editor {
		constructor( /** @type {HTMLElement} */ parent) {
			this.ready = false;

			this.drawingColor = 'black';

			/** @type {Array<Stroke>} */
			this.strokes = [];

			/** @type {Stroke | undefined} */
			this.currentStroke = undefined;

			this._initElements(parent);
		}

		addPoint(/** @type {number} */ x, /** @type {number} */ y) {
			if (this.currentStroke) {
				this.currentStroke.addPoint(x, y)
			}
		}

		beginStoke(/** @type {string} */ color) {
			this.currentStroke = new Stroke(color);
			this.strokes.push(this.currentStroke);
		}

		endStroke() {
			const previous = this.currentStroke;
			this.currentStroke = undefined;
			return previous;
		}

		setStrokes(/** @type {Array<Stroke>} */ strokes) {
			this.strokes = strokes;
			this._redraw();
		}

		_initElements(/** @type {HTMLElement} */ parent) {
			const colorButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.controls button'));
			for (const colorButton of colorButtons) {
				colorButton.addEventListener('click', () => {
					colorButtons.forEach(button => button.classList.remove('active'));
					colorButton.classList.add('active');
					this.drawingColor = colorButton.dataset['color'];
				});
			}

			this.wrapper = document.createElement('div');
			this.wrapper.className = 'image-wrapper';
			this.wrapper.style.position = 'relative';
			parent.append(this.wrapper);

			this.initialCanvas = document.createElement('canvas');
			this.initialCanvas.className = 'initial-canvas';
			this.initialCtx = this.initialCanvas.getContext('2d');
			this.wrapper.append(this.initialCanvas);

			this.drawingCanvas = document.createElement('canvas');
			this.drawingCanvas.className = 'drawing-canvas';
			this.drawingCanvas.style.position = 'absolute';
			this.drawingCanvas.style.top = '0';
			this.drawingCanvas.style.left = '0';
			this.drawingCtx = this.drawingCanvas.getContext('2d');
			this.wrapper.append(this.drawingCanvas);

			let isDrawing = false

			document.body.addEventListener('mousedown', () => {
				if (!this.ready) {
					return;
				}

				this.beginStoke(this.drawingColor);
				this.drawingCtx.strokeStyle = this.drawingColor;

				isDrawing = true;
				document.body.classList.add('drawing');
				this.drawingCtx.beginPath();
			});

			document.body.addEventListener('mouseup', async () => {
				if (!isDrawing || !this.ready) {
					return;
				}

				isDrawing = false;
				document.body.classList.remove('drawing');
				this.drawingCtx.closePath();

				const stroke = this.endStroke();

				vscode.postMessage({
					type: 'stroke',
					color: this.drawingColor,
					stroke: stroke.stroke,
				});
			});

			document.body.addEventListener('mousemove', e => {
				if (!isDrawing || !this.ready) {
					return;
				}
				const rect = this.wrapper.getBoundingClientRect();
				const x = e.clientX - rect.left;
				const y = e.clientY - rect.top;
				this.drawingCtx.lineTo(x, y);
				this.drawingCtx.stroke();
				this.addPoint(x, y);
			});
		}

		_redraw() {
			this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
			for (const stroke of this.strokes) {
				this.drawingCtx.strokeStyle = stroke.color;
				this.drawingCtx.beginPath();
				for (const [x, y] of stroke.stroke) {
					this.drawingCtx.lineTo(x, y);
				}
				this.drawingCtx.stroke();
				this.drawingCtx.closePath();
			}
		}

		setInitialImage(/** @type {HTMLImageElement} */ img) {
			this.initialCanvas.width = this.drawingCanvas.width = img.naturalWidth;
			this.initialCanvas.height = this.drawingCanvas.height = img.naturalHeight;
			this.initialCtx.drawImage(img, 0, 0);
			this.ready = true;
			this._redraw();
		}

		/** @return {Promise<Uint8Array>} */
		async getImageData() {
			const outCanvas = document.createElement('canvas');
			outCanvas.width = this.drawingCanvas.width;
			outCanvas.height = this.drawingCanvas.height;

			const outCtx = outCanvas.getContext('2d');
			outCtx.drawImage(this.initialCanvas, 0, 0);
			outCtx.drawImage(this.drawingCanvas, 0, 0);

			const blob = await new Promise(resolve => {
				outCanvas.toBlob(resolve, 'image/jpeg')
			});

			return new Uint8Array(await blob.arrayBuffer());
		}
	}

	const editor = new Editor(document.querySelector('.drawing'));

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				// Load the initial image into the canvas.
				const initialContent = new Uint8Array(body.value.data);
				const img = await loadImageFromData(initialContent);
				editor.setInitialImage(img);
				return;

			case 'update':
				// Set the drawing strokes.
				editor.setStrokes(body.edits.map(edit => new Stroke(edit.color, edit.stroke)))
				return;

			case 'getFileData':
				// Get the image data for the canvas and post it back to the extension.
				editor.getImageData().then(data => {
					vscode.postMessage({ type: 'response', requestId, body: data });
				});
				return;
		}
	});

	// Signal to VS Code that the webview is initilized.
	vscode.postMessage({ type: 'ready' });
}());

