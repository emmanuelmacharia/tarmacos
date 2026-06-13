// pdf-parse loads pdfjs-dist, whose canvas display module evaluates browser-only
// globals at import time (e.g. `const SCALE_MATRIX = new DOMMatrix()`). On Vercel's
// Node serverless runtime those globals don't exist, so importing pdf-parse throws
// `ReferenceError: DOMMatrix is not defined` before any parsing happens.
//
// Text extraction (getTextContent) does its matrix math in pure JS and never touches
// the canvas rendering path, so these globals only need to *exist* so the module can
// finish evaluating. Lightweight stubs avoid pulling in a native `canvas` dependency.

class DOMMatrixStub {
	a = 1;
	b = 0;
	c = 0;
	d = 1;
	e = 0;
	f = 0;
	m11 = 1;
	m12 = 0;
	m13 = 0;
	m14 = 0;
	m21 = 0;
	m22 = 1;
	m23 = 0;
	m24 = 0;
	m31 = 0;
	m32 = 0;
	m33 = 1;
	m34 = 0;
	m41 = 0;
	m42 = 0;
	m43 = 0;
	m44 = 1;

	constructor(_init?: unknown) {}

	multiplySelf() {
		return this;
	}
	preMultiplySelf() {
		return this;
	}
	translateSelf() {
		return this;
	}
	scaleSelf() {
		return this;
	}
	rotateSelf() {
		return this;
	}
	invertSelf() {
		return this;
	}
	setMatrixValue() {
		return this;
	}
}

class Path2DStub {
	constructor(_path?: unknown) {}
	addPath() {}
	moveTo() {}
	lineTo() {}
	bezierCurveTo() {}
	quadraticCurveTo() {}
	arc() {}
	arcTo() {}
	ellipse() {}
	rect() {}
	closePath() {}
}

class ImageDataStub {
	width: number;
	height: number;
	data: Uint8ClampedArray;

	constructor(widthOrData: number | Uint8ClampedArray, heightOrWidth?: number, height?: number) {
		if (typeof widthOrData === 'number') {
			this.width = widthOrData;
			this.height = heightOrWidth ?? 0;
			this.data = new Uint8ClampedArray(this.width * this.height * 4);
		} else {
			this.data = widthOrData;
			this.width = heightOrWidth ?? 0;
			this.height = height ?? 0;
		}
	}
}

/**
 * Installs no-op stubs for the browser globals pdfjs-dist references at module
 * evaluation time. Idempotent and safe to call before every PDF parse.
 */
export function installPdfPolyfills(): void {
	const globalScope = globalThis as Record<string, unknown>;

	if (typeof globalScope.DOMMatrix === 'undefined') {
		globalScope.DOMMatrix = DOMMatrixStub;
	}
	if (typeof globalScope.Path2D === 'undefined') {
		globalScope.Path2D = Path2DStub;
	}
	if (typeof globalScope.ImageData === 'undefined') {
		globalScope.ImageData = ImageDataStub;
	}
}
