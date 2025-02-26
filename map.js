import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiY2hlcmlleGlhbyIsImEiOiJjbGtoODJ1Y28wNjFuM2VvYTF3Ynd4d2x6In0.DJ64mMNKSWZ9FyYjOu4Y3g';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

const svg = d3.select('#map').select('svg');

// Helper functions
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.end_station_id
    );

    return stations.map((station) => {
        const id = station.short_name;
        return {
            ...station,
            departures: departures.get(id) || 0,
            arrivals: arrivals.get(id) || 0,
            totalTraffic: (departures.get(id) || 0) + (arrivals.get(id) || 0)
        };
    });
}

function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

map.on('load', async () => {
    // Add bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: { 'line-color': '#32D400', 'line-width': 5, 'line-opacity': 0.6 }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: { 'line-color': '#FC8EAC', 'line-width': 5, 'line-opacity': 0.6 }
    });

    // DOM elements
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // Load data
    try {
        const jsonData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
        let stations = jsonData.data.stations;

        let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            }
        );

        // Initial processing
        stations = computeStationTraffic(stations, trips);
        let radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

        // Create initial circles
        const circles = svg
            .selectAll('circle')
            .data(stations, (d) => d.short_name)
            .enter()
            .append('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .attr('fill', 'steelblue')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8)
            .append('title')
            .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);

        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsByTime(trips, timeFilter);
            const filteredStations = computeStationTraffic(stations, filteredTrips);
            
            radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);
            
            svg.selectAll('circle')
                .data(filteredStations, (d) => d.short_name)
                .join('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic));
        }

        function updateTimeDisplay() {
            const timeFilter = Number(timeSlider.value);
            
            if (timeFilter === -1) {
                selectedTime.textContent = '';
                anyTimeLabel.style.display = 'block';
            } else {
                selectedTime.textContent = formatTime(timeFilter);
                anyTimeLabel.style.display = 'none';
            }
            
            updateScatterPlot(timeFilter);
        }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

        function updatePositions() {
            svg.selectAll('circle')
                .attr('cx', (d) => getCoords(d).cx)
                .attr('cy', (d) => getCoords(d).cy);
        }

        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);
        updatePositions();

    } catch (error) {
        console.error('Error loading data:', error);
    }
});