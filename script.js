const state = {
    originalImage: null,
    filename: '',
    adjustedCanvas: null,
    simulatedCanvas: null,
    mode: 'normal',
    adjustments: { brightness: 100, contrast: 100, saturation: 100, exposure: 100, sharpness: 0, blur: 0 },
    zoom: 1, panX: 0, panY: 0,
    compMode: 'slider', // slider, side, overlay
    splitPercent: 50,
    isDragging: false
};

const a11yData = {
    normal: { title: "Normal Vision", pop: "N/A", desc: "Standard color vision with no deficiencies.", tips: "Ensure high contrast for general readability." },
    protanopia: { title: "Protanopia (Red-Blind)", pop: "~1.01% of men", desc: "Reds appear more beige/grey. Difficulty distinguishing red and green.", tips: "Avoid red/green color coding. Use patterns, textures, or text labels." },
    deuteranopia: { title: "Deuteranopia (Green-Blind)", pop: "~1.27% of men", desc: "Greens appear beige and reds brownish-yellow. Most common deficiency.", tips: "Use high contrast and distinct hues outside of red/green pairs." },
    tritanopia: { title: "Tritanopia (Blue-Blind)", pop: "~0.01% of pop.", desc: "Blues and greens are easily confused, as are purples and reds.", tips: "Avoid blue/yellow pairings. Check contrast ratios carefully." },
    achromatopsia: { title: "Achromatopsia", pop: "~0.003% of pop.", desc: "Total color blindness. Everything is seen in shades of grey.", tips: "Rely entirely on brightness contrast and shapes/patterns." }
};

// DOM Elements
const els = {
    uploadArea: document.getElementById('upload-area'),
    fileInput: document.getElementById('file-input'),
    previewContainer: document.getElementById('preview-container'),
    canvasWrapper: document.getElementById('canvas-wrapper'),
    cOrig: document.getElementById('canvas-original'),
    cSim: document.getElementById('canvas-simulated'),
    simLayer: document.getElementById('simulated-layer'),
    splitSlider: document.getElementById('split-slider'),
    sliders: document.querySelectorAll('.control-slider'),
    simCards: document.querySelectorAll('.sim-card'),
    historyGallery: document.getElementById('history-gallery'),
    loadingOverlay: document.getElementById('loading-overlay')
};

// Initialize
function init() {
    setupUpload();
    setupControls();
    setupSimulationCards();
    setupCanvasInteractions();
    setupShortcuts();
    loadHistory();
    setupTheme();
    window.addEventListener('resize', render);
}

// 1. Upload & File Handling
function setupUpload() {
    els.uploadArea.addEventListener('click', () => els.fileInput.click());
    els.uploadArea.addEventListener('dragover', e => { e.preventDefault(); els.uploadArea.classList.add('dragover'); });
    els.uploadArea.addEventListener('dragleave', () => els.uploadArea.classList.remove('dragover'));
    els.uploadArea.addEventListener('drop', e => {
        e.preventDefault(); els.uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    els.fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) return showToast('Please upload an image file', 'error');
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            state.originalImage = img;
            state.filename = file.name;
            resetView();
            updateImageInfo(file, img);
            addToHistory(e.target.result);
            document.getElementById('preview-placeholder').style.display = 'none';
            els.canvasWrapper.style.display = 'block';
            els.splitSlider.style.display = 'block';
            document.getElementById('floating-controls').style.display = 'flex';
            processImage();
            showToast('Image loaded successfully!', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateImageInfo(file, img) {
    document.getElementById('info-name').textContent = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;
    document.getElementById('info-size').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    document.getElementById('info-res').textContent = `${img.width} × ${img.height}`;
    document.getElementById('info-format').textContent = file.type.split('/')[1].toUpperCase();
}

// 2. Adjustments
let debounceTimer;
function setupControls() {
    els.sliders.forEach(slider => {
        slider.addEventListener('input', e => {
            const prop = e.target.dataset.control;
            state.adjustments[prop] = parseFloat(e.target.value);
            document.getElementById(`val-${prop}`).textContent = e.target.value;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(processImage, 200);
        });
    });

    document.getElementById('btn-reset-adj').addEventListener('click', () => {
        state.adjustments = { brightness: 100, contrast: 100, saturation: 100, exposure: 100, sharpness: 0, blur: 0 };
        els.sliders.forEach(s => {
            s.value = state.adjustments[s.dataset.control];
            document.getElementById(`val-${s.dataset.control}`).textContent = s.value;
        });
        processImage();
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.compMode = btn.dataset.mode;
            updateComparisonLayout();
        });
    });

    document.getElementById('btn-download').addEventListener('click', () => {
        if (!state.simulatedCanvas) return;
        const link = document.createElement('a');
        link.download = `simulated_${state.mode}_${state.filename}`;
        link.href = state.simulatedCanvas.toDataURL('image/png');
        link.click();
        showToast('Image downloaded successfully', 'success');
    });

    document.getElementById('btn-share').addEventListener('click', async () => {
        if (!state.simulatedCanvas) return;
        try {
            state.simulatedCanvas.toBlob(async blob => {
                const file = new File([blob], 'simulated.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ title: 'Color Simulation', files: [file] });
                } else {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    showToast('Copied to clipboard!', 'success');
                }
            });
        } catch(e) { showToast('Sharing not supported', 'error'); }
    });
}

function updateComparisonLayout() {
    if (state.compMode === 'slider') {
        els.splitSlider.style.display = 'block';
        els.simLayer.style.clipPath = `inset(0 ${100 - state.splitPercent}% 0 0)`;
        els.simLayer.style.opacity = 1;
    } else if (state.compMode === 'side') {
        els.splitSlider.style.display = 'none';
        els.simLayer.style.clipPath = 'none';
        els.simLayer.style.opacity = 1;
    } else if (state.compMode === 'overlay') {
        els.splitSlider.style.display = 'none';
        els.simLayer.style.clipPath = 'none';
        els.simLayer.style.opacity = 0; // handled by custom slider if needed, but for now just toggle or blink?
        // Let's implement a simple 50% opacity overlay
        els.simLayer.style.opacity = 0.5;
    }
    render();
}

// 3. Image Processing
async function processImage() {
    if (!state.originalImage) return;
    els.loadingOverlay.style.display = 'flex';
    await new Promise(r => setTimeout(r, 50)); // let UI render

    const w = state.originalImage.width;
    const h = state.originalImage.height;

    // Adjusted Canvas
    const aCanvas = document.createElement('canvas');
    aCanvas.width = w; aCanvas.height = h;
    const aCtx = aCanvas.getContext('2d');
    
    const br = state.adjustments.brightness * (state.adjustments.exposure / 100);
    aCtx.filter = `brightness(${br}%) contrast(${state.adjustments.contrast}%) saturate(${state.adjustments.saturation}%) blur(${state.adjustments.blur}px)`;
    aCtx.drawImage(state.originalImage, 0, 0);
    aCtx.filter = 'none';

    let imgData = aCtx.getImageData(0, 0, w, h);

    // Apply Sharpness (simple convolution if image isn't too massive to prevent crash)
    if (state.adjustments.sharpness > 0 && w*h < 15000000) {
        let amt = state.adjustments.sharpness / 100;
        let ctr = 1 + 4 * amt, edge = -amt;
        imgData = convolute(imgData, [0, edge, 0, edge, ctr, edge, 0, edge, 0]);
        aCtx.putImageData(imgData, 0, 0);
    }
    state.adjustedCanvas = aCanvas;

    // Simulated Canvas
    const sCanvas = document.createElement('canvas');
    sCanvas.width = w; sCanvas.height = h;
    const sCtx = sCanvas.getContext('2d');

    if (state.mode === 'normal') {
        sCtx.drawImage(aCanvas, 0, 0);
    } else {
        let sData = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
        applyColorBlindness(sData, state.mode);
        sCtx.putImageData(sData, 0, 0);
    }
    state.simulatedCanvas = sCanvas;

    els.loadingOverlay.style.display = 'none';
    render();
}

function applyColorBlindness(imageData, mode) {
    const data = imageData.data;
    const matrices = {
        protanopia: [0.56667, 0.43333, 0, 0.55833, 0.44167, 0, 0, 0.24167, 0.75833],
        deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
        tritanopia: [0.95, 0.05, 0, 0, 0.43333, 0.56667, 0, 0.475, 0.525],
        achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114]
    };
    const m = matrices[mode];
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        data[i] = r*m[0] + g*m[1] + b*m[2];
        data[i+1] = r*m[3] + g*m[4] + b*m[5];
        data[i+2] = r*m[6] + g*m[7] + b*m[8];
    }
}

function convolute(pixels, weights) {
    const side = Math.round(Math.sqrt(weights.length));
    const halfSide = Math.floor(side/2);
    const src = pixels.data;
    const w = pixels.width, h = pixels.height;
    const output = new ImageData(w, h);
    const dst = output.data;
    for (let y=0; y<h; y++) {
        for (let x=0; x<w; x++) {
            const dstOff = (y*w+x)*4;
            let r=0, g=0, b=0;
            for (let cy=0; cy<side; cy++) {
                for (let cx=0; cx<side; cx++) {
                    const scy = y + cy - halfSide;
                    const scx = x + cx - halfSide;
                    if (scy >= 0 && scy < h && scx >= 0 && scx < w) {
                        const srcOff = (scy*w+scx)*4;
                        const wt = weights[cy*side+cx];
                        r += src[srcOff] * wt;
                        g += src[srcOff+1] * wt;
                        b += src[srcOff+2] * wt;
                    }
                }
            }
            dst[dstOff] = r; dst[dstOff+1] = g; dst[dstOff+2] = b; dst[dstOff+3] = src[dstOff+3];
        }
    }
    return output;
}

// 4. Rendering & Canvas Interactions
function resetView() {
    state.zoom = 1; state.panX = 0; state.panY = 0;
    render();
}

function render() {
    if (!state.adjustedCanvas || !state.simulatedCanvas) return;
    
    const rect = els.canvasWrapper.getBoundingClientRect();
    els.cOrig.width = rect.width; els.cOrig.height = rect.height;
    els.cSim.width = rect.width; els.cSim.height = rect.height;

    const ctx1 = els.cOrig.getContext('2d');
    const ctx2 = els.cSim.getContext('2d');

    const scaleX = rect.width / state.originalImage.width;
    const scaleY = rect.height / state.originalImage.height;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * state.zoom;

    // Side-by-side mode drawing adjustments
    if (state.compMode === 'side') {
        const w = state.originalImage.width * scale;
        const h = state.originalImage.height * scale;
        const x1 = (rect.width/2 - w)/2 + state.panX;
        const y = (rect.height - h)/2 + state.panY;
        const x2 = rect.width/2 + (rect.width/2 - w)/2 + state.panX;
        
        ctx1.setTransform(scale, 0, 0, scale, x1, y);
        ctx1.drawImage(state.adjustedCanvas, 0, 0);
        ctx2.setTransform(scale, 0, 0, scale, x2, y);
        ctx2.drawImage(state.simulatedCanvas, 0, 0);
    } else {
        const x = (rect.width - state.originalImage.width * scale) / 2 + state.panX;
        const y = (rect.height - state.originalImage.height * scale) / 2 + state.panY;

        ctx1.setTransform(scale, 0, 0, scale, x, y);
        ctx1.drawImage(state.adjustedCanvas, 0, 0);
        ctx2.setTransform(scale, 0, 0, scale, x, y);
        ctx2.drawImage(state.simulatedCanvas, 0, 0);
    }
}

function setupCanvasInteractions() {
    let startX, startY;
    els.previewContainer.addEventListener('mousedown', e => {
        if (e.target.closest('.split-slider') || e.target.closest('.floating-controls')) return;
        state.isDragging = true;
        startX = e.clientX - state.panX;
        startY = e.clientY - state.panY;
        els.previewContainer.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
        if (!state.isDragging) return;
        state.panX = e.clientX - startX;
        state.panY = e.clientY - startY;
        render();
    });
    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        els.previewContainer.style.cursor = 'default';
    });
    els.previewContainer.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        state.zoom = Math.max(0.1, Math.min(state.zoom * Math.exp(wheel * zoomIntensity), 10));
        render();
    }, { passive: false });

    // Split Slider Dragging
    let isSliding = false;
    els.splitSlider.addEventListener('mousedown', () => isSliding = true);
    window.addEventListener('mouseup', () => isSliding = false);
    window.addEventListener('mousemove', e => {
        if (!isSliding || state.compMode !== 'slider') return;
        const rect = els.canvasWrapper.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        state.splitPercent = (x / rect.width) * 100;
        els.splitSlider.style.left = `${state.splitPercent}%`;
        els.simLayer.style.clipPath = `inset(0 ${100 - state.splitPercent}% 0 0)`;
    });

    // Zoom Buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => { state.zoom = Math.min(state.zoom*1.2, 10); render(); });
    document.getElementById('btn-zoom-out').addEventListener('click', () => { state.zoom = Math.max(state.zoom/1.2, 0.1); render(); });
    document.getElementById('btn-zoom-reset').addEventListener('click', resetView);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
}

// 5. Simulation Cards
function setupSimulationCards() {
    els.simCards.forEach(card => {
        card.addEventListener('click', () => {
            els.simCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.mode = card.dataset.mode;
            updateA11yInfo(state.mode);
            processImage(); // only updates simulated canvas
        });
    });
}
function updateA11yInfo(mode) {
    const info = a11yData[mode];
    document.getElementById('info-title').textContent = info.title;
    document.getElementById('info-pop').textContent = info.pop;
    document.getElementById('info-desc').textContent = info.desc;
    document.getElementById('info-tips').textContent = info.tips;
}

// 6. History
function addToHistory(dataURL) {
    // Generate small thumbnail for history
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        const dim = 100;
        c.width = dim; c.height = dim;
        const ctx = c.getContext('2d');
        // crop to square
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size)/2, sy = (img.height - size)/2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, dim, dim);
        const thumbURL = c.toDataURL('image/jpeg', 0.5);
        
        let hist = JSON.parse(localStorage.getItem('cb_history') || '[]');
        hist.unshift({ thumb: thumbURL, full: dataURL });
        if (hist.length > 5) hist = hist.slice(0, 5);
        
        try {
            localStorage.setItem('cb_history', JSON.stringify(hist));
            renderHistory(hist);
        } catch(e) { console.warn("Storage full"); }
    };
    img.src = dataURL;
}
function loadHistory() {
    const hist = JSON.parse(localStorage.getItem('cb_history') || '[]');
    renderHistory(hist);
}
function renderHistory(hist) {
    els.historyGallery.innerHTML = '';
    hist.forEach(h => {
        const img = document.createElement('img');
        img.src = h.thumb;
        img.className = 'history-item';
        img.onclick = () => fetch(h.full).then(res => res.blob()).then(blob => handleFile(new File([blob], 'history_img.png', {type:'image/png'})));
        els.historyGallery.appendChild(img);
    });
}

// 7. Utils
function showToast(msg, type='info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fas ${type==='success'?'fa-check-circle':type==='error'?'fa-exclamation-circle':'fa-info-circle'}"></i> <span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 3000);
}
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fullscreen', !!document.fullscreenElement);
    setTimeout(render, 100);
});
function setupShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); els.fileInput.click(); }
        if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); document.getElementById('btn-download').click(); }
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey) { e.preventDefault(); resetView(); }
        if (e.key.toLowerCase() === 'f' && !e.ctrlKey) { e.preventDefault(); toggleFullscreen(); }
    });
}
function setupTheme() {
    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const html = document.documentElement;
        html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
        btn.innerHTML = html.dataset.theme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    });
}

init();
