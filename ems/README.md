# CGA EMS

Cambridge Grads Academy ka Education Management System — aik hi HTML file (`index.html`),
koi server ya database nahi chahiye.

**Live:** https://asadahmed0604-pixel.github.io/cgaportal/

## Data kahan save hota hai

Sara data browser ke `localStorage` mein save hota hai (key: `schoolAcademyDB`). Is ka matlab:

- Har computer/browser ka data alag hai — aik laptop par dala hua data doosre par nazar nahi aayega.
- Browser history/site data clear karne se data mit sakta hai — **backup regularly download karein**.
- Link public hai lekin kisi ka data server par nahi jata; har user ko apne browser ka khali/apna data dikhta hai.

## Update karna

Naya version aaye to `ems/index.html` ko replace karke `main` par push karein —
GitHub Actions (`.github/workflows/pages.yml`) khud site dobara deploy kar dega.
