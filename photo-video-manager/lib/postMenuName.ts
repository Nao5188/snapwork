export const POST_MENU_NAME_MAX_LENGTH = 100;
export const CATEGORY_MARKER = '|CATEGORIES:';

const sliceToLength = (value: string, maxLength: number) => {
  if (maxLength <= 0) return '';
  return Array.from(value).slice(0, maxLength).join('');
};

const buildCategorySegment = (categories: string[], maxLength: number) => {
  const cleanCategories = categories
    .map(category => category.trim())
    .filter(Boolean);

  if (cleanCategories.length === 0 || maxLength <= CATEGORY_MARKER.length) {
    return '';
  }

  const selectedCategories: string[] = [];

  for (const category of cleanCategories) {
    const nextValue = [...selectedCategories, category].join(',');
    const nextSegment = `${CATEGORY_MARKER}${nextValue}`;

    if (Array.from(nextSegment).length <= maxLength) {
      selectedCategories.push(category);
      continue;
    }

    if (selectedCategories.length === 0) {
      const remainingLength = maxLength - CATEGORY_MARKER.length;
      return `${CATEGORY_MARKER}${sliceToLength(category, remainingLength)}`;
    }

    break;
  }

  return selectedCategories.length > 0
    ? `${CATEGORY_MARKER}${selectedCategories.join(',')}`
    : '';
};

export const buildPostMenuName = (memo: string, categories: string[]) => {
  const categorySegment = buildCategorySegment(categories, POST_MENU_NAME_MAX_LENGTH);
  const remainingMemoLength = POST_MENU_NAME_MAX_LENGTH - Array.from(categorySegment).length;
  const memoText = sliceToLength(memo.trim(), remainingMemoLength);

  return `${memoText}${categorySegment}`;
};
