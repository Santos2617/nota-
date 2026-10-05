/**
 * FRAGA SUCATAS LTDA — Gerador de QR Code Seguro
 * O QR Code contém ESTRITAMENTE a URL pública de validação com o public_id criptográfico.
 */

const QR = {
  getValidationUrl(publicId) {
    const origin = window.location.origin;
    // URL amigável no formato SPA
    return `${origin}/#/validar-nota/${encodeURIComponent(publicId)}`;
  },

  /**
   * Renderiza o QR Code em um elemento Canvas ou Div
   */
  render(targetElement, publicId, size = 200) {
    if (!targetElement) return;
    const url = this.getValidationUrl(publicId);

    // Se a biblioteca QRCode (vendored) estiver disponível
    if (typeof QRCode !== 'undefined') {
      targetElement.innerHTML = '';
      new QRCode(targetElement, {
        text: url,
        width: size,
        height: size,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      // Fallback para API pública confiável se a biblioteca falhar
      targetElement.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}" alt="QR Code" style="width: ${size}px; height: ${size}px; display: block; margin: 0 auto; border-radius: 6px;" />`;
    }
  },

  /**
   * Faz o download do QR Code em PNG com alta definição
   */
  download(publicId, friendlyNumber = 'FS-NOTA') {
    const tempContainer = document.createElement('div');
    document.body.appendChild(tempContainer);

    const url = this.getValidationUrl(publicId);

    if (typeof QRCode !== 'undefined') {
      new QRCode(tempContainer, {
        text: url,
        width: 500,
        height: 500,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });

      setTimeout(() => {
        const img = tempContainer.querySelector('img') || tempContainer.querySelector('canvas');
        let dataUrl = '';
        if (img.tagName.toLowerCase() === 'canvas') {
          dataUrl = img.toDataURL('image/png');
        } else {
          dataUrl = img.src;
        }

        const link = document.createElement('a');
        link.download = `QRCode_${friendlyNumber}_${publicId.substring(0, 8)}.png`;
        link.href = dataUrl;
        link.click();
        tempContainer.remove();
        if (window.UI) UI.showToast('Download do QR Code iniciado!');
      }, 250);
    } else {
      window.open(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}`, '_blank');
      tempContainer.remove();
    }
  },

  /**
   * Copia o link público seguro para a área de transferência
   */
  async copyLink(publicId) {
    const url = this.getValidationUrl(publicId);
    try {
      await navigator.clipboard.writeText(url);
      if (window.UI) UI.showToast('Link de validação copiado com sucesso!');
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      if (window.UI) UI.showToast('Link copiado!');
    }
  }
};

window.QR = QR;
