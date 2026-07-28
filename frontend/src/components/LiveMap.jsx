import { useEffect, useRef } from 'react'
import './LiveMap.css'

// Default centre — KIET Group of Institutions, Ghaziabad
// (Meerut Rd, Muradnagar, Modinagar, Ghaziabad, UP 201206)
const DEFAULT_CENTER = [28.7526, 77.4985]

// Approximate coords for our 5 seed collectors
// TODO: update these to real collector locations around Ghaziabad/KIET —
// these were originally seeded for Lucknow and are now just placeholders.
const COLLECTOR_COORDS = {
  'GreenCycle Scrap Hub':      [28.7607, 77.5023],
  'EcoMart Recyclers':         [28.7526, 77.4870],
  'PaperTech Waste Solutions': [28.7745, 77.5460],
  'MetalKing Scrap Dealers':   [28.7030, 77.4650],
  'TechWaste E-Recycle':       [28.7700, 77.5520],
}

// Pincode → approximate lat/lng (Ghaziabad/Muradnagar area)
const PINCODE_COORDS = {
  '201206': [28.7526, 77.4985], // KIET / Muradnagar
  '201204': [28.7690, 77.5230], // Modinagar
  '201001': [28.6692, 77.4538], // Ghaziabad city
  '201002': [28.6753, 77.4610],
  '201003': [28.6820, 77.4700],
  '201005': [28.6890, 77.4550],
  '201009': [28.6480, 77.4390],
  '201010': [28.6600, 77.4200],
  '201011': [28.6440, 77.4900],
  '201012': [28.6350, 77.3700],
  '201014': [28.6950, 77.4900],
}

function getPincodeCoords(pincode) {
  return PINCODE_COORDS[pincode] || DEFAULT_CENTER
}

/**
 * LiveMap props:
 *  mode:        'browse' | 'tracking'
 *  collectors:  array of collector objects (for browse mode)
 *  userPincode: string
 *  collectorName: string (for tracking mode)
 *  height:      number (px, default 320)
 */
export default function LiveMap({ mode = 'browse', collectors = [], userPincode, collectorName, height = 320 }) {
  const mapRef       = useRef(null)
  const mapInstance  = useRef(null)
  const moverRef     = useRef(null)
  const animRef      = useRef(null)

  useEffect(() => {
    // Wait for Leaflet CDN to be available
    const L = window.L
    if (!L || !mapRef.current) return

    // Prevent double-init
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    const userCoords = userPincode ? getPincodeCoords(userPincode) : DEFAULT_CENTER

    // Create map
    const map = L.map(mapRef.current, {
      center: userCoords,
      zoom:   14,
      zoomControl: true,
      attributionControl: true,
    })
    mapInstance.current = map

    // OpenStreetMap tiles — completely free, no API key
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // ── User marker ──────────────────────────────────────────
    const userIcon = L.divIcon({
      html: `<div class="map-marker user-marker"><span>🏠</span><div class="marker-pulse"></div></div>`,
      className: '',
      iconSize: [44, 44],
      iconAnchor: [22, 44],
    })
    L.marker(userCoords, { icon: userIcon })
      .addTo(map)
      .bindPopup('<strong>📍 Your Location</strong>')

    if (mode === 'browse') {
      // ── Show all collectors as markers ───────────────────
      collectors.forEach(c => {
        const coords = COLLECTOR_COORDS[c.name] || [
          userCoords[0] + (Math.random() - 0.5) * 0.03,
          userCoords[1] + (Math.random() - 0.5) * 0.03,
        ]
        const icon = L.divIcon({
          html: `<div class="map-marker collector-marker"><span>♻️</span></div>`,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        })
        L.marker(coords, { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width:160px">
              <strong>${c.name}</strong><br/>
              ⭐ ${c.rating} · 📞 ${c.phone}<br/>
              ${c.isAvailable ? '<span style="color:green">🟢 Available</span>' : '<span style="color:red">🔴 Busy</span>'}
            </div>
          `)
      })

      // Fit bounds to show all markers
      if (collectors.length > 0) {
        const allCoords = [
          userCoords,
          ...collectors.map(c => COLLECTOR_COORDS[c.name] || userCoords)
        ]
        map.fitBounds(allCoords, { padding: [40, 40] })
      }
    }

    if (mode === 'tracking') {
      // ── Live tracking simulation ─────────────────────────
      const collCoords = COLLECTOR_COORDS[collectorName] ||
        [userCoords[0] + 0.025, userCoords[1] - 0.018]

      // Draw route line
      const routeLine = L.polyline([collCoords, userCoords], {
        color: '#2d7a3c', weight: 4, opacity: 0.7, dashArray: '8 6'
      }).addTo(map)

      map.fitBounds([collCoords, userCoords], { padding: [50, 50] })

      // Moving collector marker
      const bikeIcon = L.divIcon({
        html: `<div class="map-marker bike-marker"><span>🏍️</span></div>`,
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 44],
      })
      const mover = L.marker(collCoords, { icon: bikeIcon })
        .addTo(map)
        .bindPopup(`<strong>🏍️ ${collectorName || 'Collector'}</strong><br/>On the way to you!`)
        .openPopup()
      moverRef.current = mover

      // Animate marker from collector → user over ~12 seconds
      let progress  = 0
      const STEPS   = 120
      const startLat = collCoords[0], startLng = collCoords[1]
      const endLat   = userCoords[0],  endLng   = userCoords[1]

      animRef.current = setInterval(() => {
        progress += 1 / STEPS
        if (progress >= 1) {
          progress = 1
          clearInterval(animRef.current)
          mover.bindPopup('<strong>✅ Collector Arrived!</strong>').openPopup()
        }
        const lat = startLat + (endLat - startLat) * easeInOut(progress)
        const lng = startLng + (endLng - startLng) * easeInOut(progress)
        mover.setLatLng([lat, lng])
      }, 100)
    }

    return () => {
      if (animRef.current) clearInterval(animRef.current)
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [mode, userPincode, collectorName, collectors.length])

  return (
    <div className="live-map-wrap" style={{ height }}>
      <div ref={mapRef} className="live-map-container" style={{ height: '100%' }} />
    </div>
  )
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
