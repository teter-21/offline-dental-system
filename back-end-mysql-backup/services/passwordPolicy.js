"use strict";

// No composition, dictionary, case, digit, or special-character requirements.
// Keep validation identical to browser minlength=6 (UTF-16 code units).
function passwordError(password) {
  return typeof password === "string" && password.length >= 6
    ? null
    : "Password must be at least 6 characters.";
}

module.exports = { passwordError };
