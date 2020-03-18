// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	 * A drawing stroke
	 */
	class Stroke {
		constructor(/** @type {string} */ color, /** @type {Array<[number, number]> | undefined} */ points) {
			this.color = color;
			/** @type {Array<[number, number]>} */
			this.points = points || [];
		}

		add(/** @type {number} */ x, /** @type {number} */ y) {
			this.points.push([x, y])
		}
	}

	class Model {
		constructor() {
			/** @type {Array<Stroke>} */
			this.strokes = [];

			/** @type {Stroke | undefined} */
			this.currentStroke = undefined;

			/** @type {Array<() => void>} */
			this.listeners = [];
		}

		listen(/** @type {() => void} */ listener) {
			this.listeners.push(listener);
		}

		begin(color) {
			this.currentStroke = new Stroke(color);
			this.strokes.push(this.currentStroke);
		}

		end() {
			const previous = this.currentStroke;
			this.currentStroke = undefined;
			this.listeners.forEach(x => x());
			return previous;
		}

		add(/** @type {number} */ x, /** @type {number} */ y) {
			if (this.currentStroke) {
				this.currentStroke.add(x, y)
			}
		}

		setStrokes( /** @type {Array<Stroke>} */ newStrokes) {
			this.strokes = newStrokes;
			this.listeners.forEach(x => x());
		}
	}

	class View {
		constructor(
			/** @type {HTMLElement} */ parent,
			/** @type {Model} */ model,
		) {
			this.ready = false;
			this.drawingColor = 'black';

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

				model.begin(this.drawingColor);
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

				const stroke = model.end();

				vscode.postMessage({
					type: 'stroke',
					color: this.drawingColor,
					points: stroke.points,
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
				model.add(x, y);
			});

			model.listen(() => {
				this.redraw(model);
			});
		}

		redraw(model) {
			this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
			for (const stroke of model.strokes) {
				this.drawingCtx.strokeStyle = stroke.color;
				this.drawingCtx.beginPath();
				for (const [x, y] of stroke.points) {
					this.drawingCtx.lineTo(x, y);
				}
				this.drawingCtx.stroke();
				this.drawingCtx.closePath();
			}
		}

		async drawBackgroundImage(/** @type {Uint8Array} */ initialContent) {
			const blob = new Blob([initialContent], { 'type': 'image/png' });
			const url = URL.createObjectURL(blob);
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});

			this.initialCanvas.width = this.drawingCanvas.width = img.naturalWidth;
			this.initialCanvas.height = this.drawingCanvas.height = img.naturalHeight;
			this.initialCtx.drawImage(img, 0, 0);
			this.ready = true;
		}

		/** @return {Promise<Uint8Array>} */
		async getData() {
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

	const model = new Model();
	model.listen(() => {
		updateState({ strokes: model.strokes.map(x => x.points) });
	});

	const view = new View(document.querySelector('.drawing'), model);
	window.addEventListener('message', e => {
		switch (e.data.type) {
			case 'init':
				init(new Uint8Array(e.data.value.data));
				break;

			case 'update':
				model.setStrokes(e.data.edits.map(edit => new Stroke(edit.color, edit.stroke)))
				break;
		}
	});

	const state = vscode.getState();
	if (state) {
		model.setStrokes((state.strokes || []).map(x => new Stroke(x)));
		init(state.uri);
	}

	async function init(initialContent) {
		updateState({ initialContent });
		await view.drawBackgroundImage(initialContent);
		view.redraw(model);
	}

	function updateState(newState) {
		const s = vscode.getState();
		vscode.setState({ ...s, ...newState });
	}
}());