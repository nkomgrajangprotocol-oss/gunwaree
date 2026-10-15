/* GunWaree auth pages: login, signup and forgot password.
   Uses POST /auth/login, /auth/signup, /auth/forgot-password and /auth/reset-password.
   Client-side checks are a convenience; the backend validates everything again. */

(function (GW) {
  'use strict';

  var t = GW.t;
  var EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;   // same rule as backend schemas.py
  var LETTER = /[A-Za-zก-ฮ]/;               // Latin or Thai consonant
  var DIGIT = /\d/;

  function byteLength(s) {
    return new TextEncoder().encode(s).length;
  }

  /* ---------- Validators (return a bilingual message, or null when valid) ---------- */

  var check = {
    required: function (v) {
      return String(v).trim() ? null : t.fields.required;
    },
    username: function (v) {
      v = v.trim();
      if (!v) return t.fields.required;
      return v.length < 3 || v.length > 32 ? t.fields.usernameLength : null;
    },
    email: function (v) {
      v = v.trim();
      if (!v) return t.fields.required;
      return v.length > 254 || !EMAIL_PATTERN.test(v) ? t.fields.emailFormat : null;
    },
    newPassword: function (v) {
      if (!v) return t.fields.required;
      if (v.length < 8) return t.fields.passwordLength;
      if (!LETTER.test(v) || !DIGIT.test(v)) return t.fields.passwordMix;
      // bcrypt on the backend accepts at most 72 bytes (a Thai character is 3 bytes)
      return byteLength(v) > 72 ? t.fields.passwordTooLong : null;
    },
    confirm: function (v, form) {
      if (!v) return t.fields.required;
      return v === form.elements.password.value ? null : t.fields.confirmMatch;
    },
    terms: function (checked) {
      return checked ? null : t.fields.termsRequired;
    }
  };

  /* ---------- Field and form helpers ---------- */

  function valueOf(input) {
    return input.type === 'checkbox' ? input.checked : input.value;
  }

  function setFieldError(input, msg) {
    var field = input.closest('.field');
    var err = field && field.querySelector('.field__error');
    if (!field || !err) return;
    field.classList.toggle('is-invalid', !!msg);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      GW.renderBi(err, msg);
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.textContent = '';
      err.hidden = true;
    }
  }

  // Validates every rule, marks fields, focuses the first problem. Returns true when valid.
  function validate(form, rules) {
    var first = null;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      var msg = rules[name](valueOf(input), form);
      setFieldError(input, msg);
      if (msg && !first) first = input;
    });
    form.setAttribute('data-validated', '');
    if (first) first.focus();
    return !first;
  }

  // After the first submit attempt, re-check a field as the person fixes it
  function liveValidate(form, rules) {
    function recheck(e) {
      if (!form.hasAttribute('data-validated')) return;
      var name = e.target.name;
      if (rules[name]) setFieldError(e.target, rules[name](valueOf(e.target), form));
      if (name === 'password' && rules.confirm && form.elements.confirm.value) {
        setFieldError(form.elements.confirm, rules.confirm(form.elements.confirm.value, form));
      }
    }
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);
  }

  function part(form, name) {
    return form.querySelector('[data-' + name + ']');
  }

  function showAlert(form, msg) {
    var el = part(form, 'alert');
    if (el) GW.renderBi(el, msg);
  }

  function showNote(form, msg) {
    var el = part(form, 'note');
    if (el) GW.renderBi(el, msg);
  }

  function setStatus(form, msg) {
    var el = part(form, 'status');
    if (el) GW.renderBi(el, msg);
  }

  // Busy state: the label says what is happening; nothing spins
  function setBusy(form, msg) {
    var btn = form.querySelector('button[type="submit"]');
    var label = btn.querySelector('.btn__label');
    if (msg) {
      btn._idleLabel = label.cloneNode(true);
      GW.renderBi(label, msg);
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      if (btn._idleLabel) label.replaceWith(btn._idleLabel);
      btn._idleLabel = null;
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      setStatus(form, null);
    }
  }

  function submitWith(form, rules, busyMsg, run) {
    liveValidate(form, rules);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('[aria-busy="true"]')) return;
      showAlert(form, null);
      if (!validate(form, rules)) return;

      setBusy(form, busyMsg);
      var onSlow = function () { setStatus(form, t.states.connecting); };
      run(onSlow)
        .catch(function (err) {
          if (err && err.handled) return;
          showAlert(form, GW.messageFor(err, err && err.overrides));
          var alert = part(form, 'alert');
          if (alert) alert.scrollIntoView({ block: 'nearest' });
        })
        .then(function () { setBusy(form, null); });
    });
  }

  /* ---------- Signed-in state ---------- */

  function showSignedIn(session) {
    var done = document.querySelector('[data-done]');
    if (!done) return;
    var role = t.roles[session.role] || { en: session.role, th: session.role };
    done.querySelectorAll('[data-done-user]').forEach(function (el) { el.textContent = session.username; });
    done.querySelectorAll('[data-done-role]').forEach(function (el) {
      el.textContent = el.lang === 'th' ? role.th : role.en;
    });
    document.querySelectorAll('[data-auth-view]').forEach(function (el) { el.hidden = true; });
    done.hidden = false;
    var title = done.querySelector('[tabindex="-1"]');
    if (title) title.focus();
  }

  function signedIn(data, username, remember) {
    var session = GW.session.save({ token: data.token, role: data.role, username: username }, remember);
    var next = GW.safeNext();
    var dest = next ? GW.ROOT + next : GW.url(data.role);
    if (dest) window.location.assign(dest);
    else showSignedIn(session);
  }

  function login(username, password, onSlow) {
    return GW.request('/auth/login', {
      method: 'POST',
      body: { username: username, password: password },
      auth: false,
      redirectOn401: false,
      onSlow: onSlow
    });
  }

  /* ---------- Login ---------- */

  function initLogin(form) {
    var rules = {
      username: check.required,
      password: check.required
    };

    // Arriving from signup when the automatic login could not finish
    var params = new URLSearchParams(window.location.search);
    if (params.get('u')) form.elements.username.value = params.get('u');
    if (params.has('created')) showNote(form, t.states.accountCreated);

    submitWith(form, rules, t.states.loggingIn, function (onSlow) {
      var username = form.elements.username.value.trim();
      var remember = form.elements.remember.checked;
      return login(username, form.elements.password.value, onSlow)
        .then(function (data) { signedIn(data, username, remember); })
        .catch(function (err) {
          err.overrides = { 401: t.errors.loginFailed };
          form.elements.password.value = '';
          throw err;
        });
    });
  }

  /* ---------- Signup ---------- */

  function initSignup(form) {
    var rules = {
      username: check.username,
      email: check.email,
      password: check.newPassword,
      confirm: check.confirm,
      terms: check.terms
    };

    submitWith(form, rules, t.states.creating, function (onSlow) {
      var username = form.elements.username.value.trim();
      var password = form.elements.password.value;
      // Only username, email and password: the backend sets role = client itself
      return GW.request('/auth/signup', {
        method: 'POST',
        body: { username: username, email: form.elements.email.value.trim(), password: password },
        auth: false,
        onSlow: onSlow
      }).then(function () {
        return login(username, password, onSlow).then(
          function (data) { signedIn(data, username, false); },
          function () {
            // Account exists but the automatic login failed: continue on the login page
            var back = GW.safeNext();
            window.location.assign(GW.url('login') + '?created&u=' + encodeURIComponent(username) +
              (back ? '&next=' + encodeURIComponent(back) : ''));
            var stop = new Error('redirecting');
            stop.handled = true;
            throw stop;
          }
        );
      });
    });
  }

  /* ---------- Forgot and reset password ---------- */

  function initForgot(requestForm, resetForm) {
    function showReset(email) {
      requestForm.hidden = true;
      resetForm.hidden = false;
      if (email) resetForm.elements.email.value = email;
      (email ? resetForm.elements.code : resetForm.elements.email).focus();
    }

    submitWith(requestForm, { email: check.email }, t.states.sending, function (onSlow) {
      var email = requestForm.elements.email.value.trim();
      return GW.request('/auth/forgot-password', {
        method: 'POST',
        body: { email: email },
        auth: false,
        onSlow: onSlow
      }).then(function () {
        // Same answer whether or not the email exists, matching the backend
        showNote(resetForm, t.states.codeIssued);
        showReset(email);
      });
    });

    var haveCode = document.querySelector('[data-have-code]');
    if (haveCode) {
      haveCode.addEventListener('click', function () {
        showReset(requestForm.elements.email.value.trim());
      });
    }

    var rules = {
      email: check.email,
      code: check.required,
      password: check.newPassword,
      confirm: check.confirm
    };

    submitWith(resetForm, rules, t.states.saving, function (onSlow) {
      return GW.request('/auth/reset-password', {
        method: 'POST',
        body: {
          email: resetForm.elements.email.value.trim(),
          code: resetForm.elements.code.value.trim(),
          new_password: resetForm.elements.password.value
        },
        auth: false,
        onSlow: onSlow
      }).then(function () {
        // The backend signs the account out everywhere after a reset
        GW.session.clear();
        document.querySelectorAll('[data-auth-view]').forEach(function (el) { el.hidden = true; });
        var done = document.querySelector('[data-done]');
        done.hidden = false;
        done.querySelector('[tabindex="-1"]').focus();
      }, function (err) {
        if (err.status === 400) {
          setFieldError(resetForm.elements.code, t.errors.codeInvalid);
          resetForm.elements.code.focus();
          err.handled = true;
        }
        throw err;
      });
    });
  }

  /* ---------- Password visibility toggles ---------- */

  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      input.focus();
    });
  });

  /* ---------- Log out (no logout endpoint yet: the token is dropped locally) ---------- */

  document.querySelectorAll('[data-logout]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      GW.session.clear();
      window.location.reload();
    });
  });

  /* ---------- Wire up whichever forms this page has ---------- */

  var loginForm = document.querySelector('[data-form="login"]');
  var signupForm = document.querySelector('[data-form="signup"]');
  var forgotForm = document.querySelector('[data-form="forgot"]');
  var resetForm = document.querySelector('[data-form="reset"]');

  // Keep the page to return to when switching between login and signup
  var back = GW.safeNext();
  if (back) {
    document.querySelectorAll('a[href="signup.html"], a[href="login.html"]').forEach(function (a) {
      a.href = a.getAttribute('href') + '?next=' + encodeURIComponent(back);
    });
  }

  if (loginForm) initLogin(loginForm);
  if (signupForm) initSignup(signupForm);
  if (forgotForm && resetForm) initForgot(forgotForm, resetForm);

  // Already signed in: show that instead of the form
  var existing = GW.session.get();
  if (existing && (loginForm || signupForm)) showSignedIn(existing);
})(window.GW = window.GW || {});
