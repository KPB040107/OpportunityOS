// Capture a clock value once per server request. RPCs recheck expiry atomically.
export async function requestTime(){return Date.now();}
