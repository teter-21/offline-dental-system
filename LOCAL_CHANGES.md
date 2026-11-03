# November 2026 local changes

- Patient directory complaint displays the latest nonempty visit complaint, falling back to the original patient complaint. No SQL migration required.
- Treatment History procedure cells wrap long multi-service names and remain visible by horizontal scrolling.
- Newly issued administrator JWT and database sessions expire after 8 hours. Existing sessions retain their previous expiration; sign in again.
- Add Patient supports **Take Camera Picture** with a browser camera preview, Capture Photo, and Cancel Camera; the image is uploaded by the same private local image path as a selected file. Browser camera permission is required. The camera operates on localhost.

Keep your existing `.env` file and `back-end/storage/patient-images/` when replacing your local installation.
