🧭 Mediano plazo:

5. Diagrama lineal del recorrido — el Metropolitano es un corredor norte-sur, ideal para un SVG simplificado que muestre las estaciones del viaje resaltadas. Más orientativo que texto.
6. Geolocalización para origen —  navigator.geolocation  + lat/lng en  routes.json  para pre-seleccionar la estación más cercana. Elimina el paso más común (escoger origen).
7. Estimado de tiempo —  stops × ~3 min + 5 min por trasbordo . No es preciso pero da un ballpark útil.

────────────────────

❌ Lo que no haría ahora:

• Integración con datos en tiempo real (requiere backend o GTFS feed de ATU — complejidad alta, valor incierto si ATU no expone API estable)
• App nativa (la PWA ya es instalable)
• Notificaciones push (requiere service worker complejo + permiso usuario)