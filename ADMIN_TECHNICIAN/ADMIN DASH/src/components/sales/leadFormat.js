// ₹ formatting shared by the Sales summary cards and Analytics tab.
export const formatInr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
