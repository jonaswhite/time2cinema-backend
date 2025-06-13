// 格式化票房數字
export const formatTickets = (tickets: number | null): string => {
  if (tickets === null) return 'N/A';
  if (tickets >= 100000000) {
    return `${(tickets / 100000000).toFixed(1)}億`;
  } else if (tickets >= 10000) {
    return `${(tickets / 10000).toFixed(1)}萬`;
  } else if (tickets >= 1000) {
    return `${(tickets / 1000).toFixed(1)}千`;
  }
  return tickets.toString();
};

// 格式化日期
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return '未定';
  return dateString.split('T')[0];
};
