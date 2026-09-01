export function openWhatsAppSupport(companyName = "Barco", extraText = "") {
  const phone = "919632724143";
  const text = `Hi! We are from ${companyName || 'Barco'}. We need AV support for our conference room.${extraText ? ` (${extraText})` : ''}`;
  const encodedText = encodeURIComponent(text);
  window.open(`https://wa.me/${phone}?text=${encodedText}`, '_blank');
}
