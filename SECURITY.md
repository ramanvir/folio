# Security policy

Mull Reader is a static site with no backend, no accounts, and no stored user data. Documents are read in the visitor's own browser and never reach a server, so there is no database to breach and no credentials to leak.

That leaves the rendering path as the part worth attacking.

## What matters most

Markdown is parsed with [marked](https://github.com/markedjs/marked) and sanitised with [DOMPurify](https://github.com/cure53/DOMPurify) before it is written to the DOM. The highest-value finding is therefore **a crafted markdown document that achieves script execution or otherwise escapes the sanitiser**. Because people open documents produced by agents and downloaded from elsewhere, a bypass here is a real risk to real users.

Also in scope:

- Bypasses of the URL filtering that keeps `javascript:` and similar schemes out of links and images.
- Anything that causes a document's contents to leave the machine.
- Service worker or cache poisoning that could persist hostile content across sessions.

Out of scope: missing security headers on the GitHub Pages / Cloudflare hosting layer, denial of service through enormous input files, findings that require the victim to paste attacker-supplied code into a console, and vulnerabilities in the vendored libraries that are already public and fixed upstream (please open a normal issue to prompt a version bump instead).

## Reporting

Please report privately through [GitHub's security advisory form](https://github.com/ramanvir/mull-reader/security/advisories/new) rather than opening a public issue, and give me a reasonable window to ship a fix before disclosing.

Include the markdown input that triggers it if you can — a minimal reproducing document is worth more than a description.

## Supported versions

Only the current published version is supported. There are no release branches; fixes land on `main` and deploy immediately.
