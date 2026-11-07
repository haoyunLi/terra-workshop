export function resolveIconAsset(item, sheets, fallbackLabel) {
  const label = item?.name || fallbackLabel || item?.english || (item?.id ? `物品 #${item.id}` : '未识别的物品');
  const missing = reason => ({ kind: 'missing', label, reason });
  if (!item) return missing('没有匹配的图标资料');
  if (typeof item.iconFile === 'string' && item.iconFile.trim()) {
    return { kind: 'image', label, src: `./${item.iconFile.replace(/^(?:\.\/)+/, '')}` };
  }
  if (!item.sprite) return missing(/内部/.test(label) ? '内部特殊条目，游戏未提供物品图标' : '暂未收录图标');
  if (!Array.isArray(item.sprite) || item.sprite.length !== 5 || !item.sprite.every(Number.isFinite)) return missing('图标坐标无效');
  const [index, x, y, width, height] = item.sprite, sheet = sheets?.[index];
  if (!Number.isInteger(index) || index < 0 || !sheet || typeof sheet.file !== 'string' || !sheet.file ||
    !Number.isFinite(sheet.w) || !Number.isFinite(sheet.h) || sheet.w <= 0 || sheet.h <= 0) return missing('图集资源信息缺失');
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > sheet.w || y + height > sheet.h) return missing('图标坐标超出图集范围');
  return { kind: 'sprite', label, src: `./${sheet.file.replace(/^(?:\.\/)+/, '')}`, x, y, width, height, sheetWidth: sheet.w, sheetHeight: sheet.h };
}
