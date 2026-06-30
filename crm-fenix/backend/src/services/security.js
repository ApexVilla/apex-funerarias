function maskPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "********";
  const ddd = digits.slice(0, 2);
  const suffix = digits.slice(-4);
  return `(${ddd}) *****-${suffix}`;
}

module.exports = {
  maskPhone
};
