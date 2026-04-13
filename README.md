# kaalii-security-node


## Matching variables

Use the exact same variable names:

- `LICENSE_PURCHASE_CODE`
- `PRODUCT_SLUG`
- `API_TOKEN`
- `VERIFICATION_KEY`

## Install

This package is not published to the public npm registry yet. Install it directly from GitHub:

```bash
npm install git+https://github.com/kaaliicore/kaalii-security-node.git
```

You can also use the GitHub shortcut:

```bash
npm install kaaliicore/kaalii-security-node
```




Then use this package locally or publish it as an NPM package.

## Express

Create a local wrapper file in data folder called `security.js`:

```js
const { createSecurityCheckMiddleware } = require("kaalii-security-node");
module.exports = createSecurityCheckMiddleware();
```

Then in your application entry point:

```js
app.use(require("./data/security"));
```

## Key file

`data/a2FhbGlp.key`

```ini
LICENSE_PURCHASE_CODE=your-purchase-code
PRODUCT_SLUG=your-product-slug
API_TOKEN=your-api-token
VERIFICATION_KEY=your-verification-key
```

## check installation status security packages 

```bash
node -e "console.log(Object.keys(require('kaalii-security-node')))"
```

##  uninstall security packages 

```bash
npm uninstall kaalii-security-node  
npm cache clean --force    
``` 