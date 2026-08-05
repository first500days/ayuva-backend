// Matches ayuva-admin's brand teal (src/styles.css --brand: oklch(0.53 0.09 186)).
export const AYUVA_TEAL = 'oklch(0.53 0.09 186)';
const AYUVA_TEAL_STRONG = 'oklch(0.44 0.08 186)';
const AYUVA_TEAL_SOFT = 'oklch(0.95 0.03 185)';

export const scalarCustomCss = `
.light-mode {
  --scalar-color-accent: ${AYUVA_TEAL};
  --scalar-button-1: ${AYUVA_TEAL};
  --scalar-button-1-hover: ${AYUVA_TEAL_STRONG};
  --scalar-background-accent: ${AYUVA_TEAL_SOFT};
}
.dark-mode {
  --scalar-color-accent: ${AYUVA_TEAL};
  --scalar-button-1: ${AYUVA_TEAL};
  --scalar-button-1-hover: ${AYUVA_TEAL_STRONG};
}
.light-mode .t-doc__sidebar,
.dark-mode .t-doc__sidebar {
  --scalar-sidebar-item-active-background: ${AYUVA_TEAL_SOFT};
  --scalar-sidebar-color-active: ${AYUVA_TEAL_STRONG};
}
`;
