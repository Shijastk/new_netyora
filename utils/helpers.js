/**
 * Sanitizes input by removing potentially harmful characters
 * @param {string} input - The input string to sanitize
 * @returns {string} - The sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/[&<>"']/g, (char) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char];
    });
};

/**
 * Formats a date to a readable string
 * @param {Date} date - The date to format
 * @returns {string} - The formatted date string
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Generates a random string of specified length
 * @param {number} length - The length of the random string
 * @returns {string} - The random string
 */
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Validates an email address
 * @param {string} email - The email to validate
 * @returns {boolean} - Whether the email is valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Truncates a string to a specified length
 * @param {string} str - The string to truncate
 * @param {number} length - The maximum length
 * @returns {string} - The truncated string
 */
const truncateString = (str, length = 100) => {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
};

module.exports = {
  sanitizeInput,
  formatDate,
  generateRandomString,
  isValidEmail,
  truncateString
}; 