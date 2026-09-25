# CGA EMS

Cambridge Grads Academy ka Education Management System — aik hi HTML file (`index.html`),
koi server ya database nahi chahiye.

## Render par live karna (aik dafa)

1. https://dashboard.render.com par GitHub se login karein.
2. **New → Blueprint** dabayein aur `asadahmed0604-pixel/cgaportal` repo select karein.
3. Render `render.yaml` khud parh lega aur `cga-ems` naam ki **Static Site** (free) bana dega → **Apply**.
4. Link milega: `https://cga-ems.onrender.com` (naam pehle se liya hua ho to thoda alag hoga).
5. Apna domain lagana ho (jaise `ems.cga.com.pk`): Render mein site → **Settings → Custom Domains**,
   phir domain ke DNS mein jo CNAME Render bataye wo add kar dein. SSL Render khud laga deta hai.

Static site free hai aur "sleep" nahi hoti — foran khulti hai.

## Data kahan save hota hai

Sara data browser ke `localStorage` mein save hota hai (key: `schoolAcademyDB`). Is ka matlab:

- Har computer/browser ka data alag hai — aik laptop par dala hua data doosre par nazar nahi aayega.
- Browser history/site data clear karne se data mit sakta hai — **backup regularly download karein**.
- Link public hai lekin kisi ka data server par nahi jata; har user ko apne browser ka khali/apna data dikhta hai.

## Update karna

Naya version aaye to `ems/index.html` ko replace karke `main` par push karein —
Render khud naya version deploy kar dega (`autoDeploy`).

GitHub Pages backup ke taur par mojood hai: Settings → Pages → Source "GitHub Actions" karke
Actions tab se "Deploy CGA EMS to GitHub Pages" hath se chalayein.
