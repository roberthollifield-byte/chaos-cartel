// Track address shown at the bottom of every ticket (email + on-screen).
export const TRACK_ADDRESS_LINE1 = "241 Vance Street";
export const TRACK_ADDRESS_LINE2 = "Forest City, North Carolina 28043";
export const TRACK_ADDRESS = `${TRACK_ADDRESS_LINE1}, ${TRACK_ADDRESS_LINE2}`;
export const TRACK_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(TRACK_ADDRESS)}`;
