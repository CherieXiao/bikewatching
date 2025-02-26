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

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

map.on('load', async () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
      });
      
    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
        'line-color': '#32D400',  // A bright green using hex code
        'line-width': 5,          // Thicker lines
        'line-opacity': 0.6       // Slightly less transparent
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
      
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
        'line-color': '#FC8EAC',
        'line-width': 5,          // Thicker lines
        'line-opacity': 0.6       // Slightly less transparent
        }
    });

    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        jsonData = await d3.json(jsonurl);
        console.log('Loaded JSON Data:', jsonData);
    } catch (error) {
        console.error('Error loading JSON:', error);
    }

    let stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    svg.selectAll('circle')
        .data(stations)
        .join('circle')
        .attr('r', 5)
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8);

    // Update positions initially
    updatePositions();

    // Add event listeners
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    let trips;
    try {
        const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        trips = await d3.csv(csvurl);
        console.log('Loaded Traffic Data:', trips);
    } catch (error) {
        console.error('Error loading traffic data:', error);
    }

    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
      );
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );
    stations = stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures; 
        return station;
      });
      console.log('Stations with Traffic Data:', stations);
});



function updatePositions() {
    svg.selectAll('circle')
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
}