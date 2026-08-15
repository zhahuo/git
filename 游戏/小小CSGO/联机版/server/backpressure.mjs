export function shouldDropOutbound(writableLength, limit) {
  return writableLength > limit;
}
