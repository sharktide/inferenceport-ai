function getReadableColor(): string {
  let color = '';
  let brightness = 255;

  while (brightness > 180) {
    color = '#' + Array.from({ length: 3 }, () =>
      Math.floor(Math.random() * 180).toString(16).padStart(2, '0')
    ).join('');

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return color;
}

const emojis: string[] = ["🚀", "🌈", "🧠", "🎯", "🔥", "💡", "🌟", "🛠️", "📚", "🎨"];
function getEmoji() {return emojis[Math.floor(Math.random() * emojis.length)]}

export { getReadableColor, getEmoji }