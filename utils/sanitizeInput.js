// utils/sanitizeInput.js

const sanitize = (input) => {
  if (typeof input === "string") {
    return input.replace(/[<>$]/g, "");
  }
  if (Array.isArray(input)) {
    // Sanitize each element in the array, but keep it as an array!
    return input.map(sanitize);
  }
  if (typeof input === "object" && input !== null) {
    const sanitized = {};
    for (const key in input) {
      sanitized[key] = sanitize(input[key]);
    }
    return sanitized;
  }
  return input;
};

module.exports = sanitize;
