// layered elevation — hairline + ambient, each level lifts a bit further
export const shadows = {
  low: '0 1px 2px rgba(8, 11, 13, 0.06), 0 1px 1px rgba(8, 11, 13, 0.04)',
  med: '0 4px 12px rgba(8, 11, 13, 0.08), 0 2px 4px rgba(8, 11, 13, 0.05)',
  high: '0 14px 34px rgba(8, 11, 13, 0.12), 0 4px 12px rgba(8, 11, 13, 0.08)',
  // kept for backwards-compat with existing references
  floating:
    '0 14px 34px rgba(8, 11, 13, 0.12), 0 4px 12px rgba(8, 11, 13, 0.08)',
}
