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
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

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

function computeStationTraffic(stations, timeFilter = -1) {
    const filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
    const filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);

    const departures = d3.rollup(
        filteredDepartures,
        (v) => v.length,
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        filteredArrivals,
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

function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) return tripsByMinute.flat();
    
    const minMinute = (minute - 60 + 1440) % 1440;
    const maxMinute = (minute + 60) % 1440;

    if (minMinute > maxMinute) {
        return [
            ...tripsByMinute.slice(minMinute),
            ...tripsByMinute.slice(0, maxMinute)
        ].flat();
    }
    return tripsByMinute.slice(minMinute, maxMinute).flat();
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

    try {
        const jsonData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
        let stations = jsonData.data.stations;

        // Load and bucket trips
        await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                
                const startMin = minutesSinceMidnight(trip.started_at);
                const endMin = minutesSinceMidnight(trip.ended_at);
                departuresByMinute[startMin].push(trip);
                arrivalsByMinute[endMin].push(trip);
                
                return trip;
            }
        );

        // Initial processing
        stations = computeStationTraffic(stations);
        let radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

        // Create circles
        const circles = svg
            .selectAll('circle')
            .data(stations, (d) => d.short_name)
            .enter()
            .append('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic))
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8)
            .append('title')
            .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);

        function updateScatterPlot(timeFilter) {
            const filteredStations = computeStationTraffic(stations, timeFilter);
            
            radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);
            
            svg.selectAll('circle')
                .data(filteredStations, (d) => d.short_name)
                .join('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic))
                .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));
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

        function updatePositions() {
            svg.selectAll('circle')
                .attr('cx', (d) => getCoords(d).cx)
                .attr('cy', (d) => getCoords(d).cy);
        }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);
        updatePositions();

    } catch (error) {
        console.error('Error loading data:', error);
    }
});