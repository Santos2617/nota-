/**
 * FRAGA SUCATAS LTDA — Leitor de QR Code via Câmera e Upload de Imagem
 */

class QRScanner {
  constructor(videoElement, canvasElement, onScanCallback) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext('2d', { willReadFrequently: true }) : null;
    this.onScan = onScanCallback;
    this.stream = null;
    this.scanning = false;
    this.animationId = null;
    this.facingMode = 'environment';
  }

  async start() {
    if (this.scanning) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.video.srcObject = this.stream;
      this.video.setAttribute('playsinline', true);
      await this.video.play();

      this.scanning = true;
      this.tick();
    } catch (err) {
      console.warn('Falha ao acessar câmera:', err);
      if (window.UI) {
        UI.showToast('Não foi possível acessar a câmera. Você pode digitar o código ou enviar uma imagem.', 'warning', 5000);
      }
      throw err;
    }
  }

  stop() {
    this.scanning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  toggleCamera() {
    this.stop();
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return this.start();
  }

  tick() {
    if (!this.scanning) return;

    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          this.playBeep();
          this.stop();
          this.handleDetectedCode(code.data);
          return;
        }
      }
    }

    this.animationId = requestAnimationFrame(() => this.tick());
  }

  handleDetectedCode(text) {
    let extracted = text.trim();
    // Se for URL completa: https://dominio.com/#validar-nota/ID_SEGURO
    if (extracted.includes('validar-nota/')) {
      extracted = extracted.split('validar-nota/')[1].split('?')[0].split('#')[0];
    } else if (extracted.includes('?codigo=')) {
      extracted = extracted.split('?codigo=')[1].split('&')[0];
    }
    extracted = decodeURIComponent(extracted.trim());
    if (this.onScan) {
      this.onScan(extracted);
    }
  }

  /**
   * Processa upload de arquivo de imagem com QR Code
   */
  async scanFile(file) {
    const img = new Image();
    const dataUrl = await UI.fileToBase64(file);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        if (typeof jsQR !== 'undefined') {
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            this.playBeep();
            this.handleDetectedCode(code.data);
            resolve(code.data);
          } else {
            reject(new Error('Nenhum QR Code legível foi detectado nesta imagem.'));
          }
        } else {
          reject(new Error('Biblioteca de leitura de QR Code não carregada.'));
        }
      };
      img.onerror = () => reject(new Error('Falha ao abrir o arquivo de imagem.'));
      img.src = dataUrl;
    });
  }

  playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Tom A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {}
  }
}

window.QRScanner = QRScanner;
