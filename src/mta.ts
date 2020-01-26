import dotenv from "dotenv";
import axios from "axios";
import gtfsRB from "gtfs-rb";
import { ITrip, IJsonResponse } from "./mta-interfaces";

const stationData = require("./station-data.json");
const { FeedMessage } = gtfsRB.transit_realtime;
dotenv.config();

// Confirm key has been entered
if (process.env.MTA_API_KEY === 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
  console.error(`Error: You must enter a valid API key from the MTA.`);
  process.exit(1);
}

// Convert seconds to to m, s string
function secsToMins(time: number): string {
  const minutes: number = Math.floor(time / 60);
  const seconds: number = time - minutes * 60;
  return `${minutes}m, ${seconds}s`;
}

// Convert epoch time to human readable time
function convertEpoch(time: number): string {
  const date: Date = new Date(time * 1000);
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

// Hit the MTA endpoint
async function makeRequest(url: string) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer"
    });
    return Promise.resolve(response);
  } catch (err) {
    console.error(err);
    return Promise.resolve(err);
  }
}

// The MTA has 8 different feeds to pull the data from
async function getRawData() {
  const promises: any[] = [];
  const feeds = {
    1: "1,2,3,4,5,6,S",
    2: "L",
    16: "N,Q,R,W",
    21: "B,D,F,M",
    26: "A,C,E,H,S",
    31: "G",
    36: "J,Z",
    51: "7"
  };

  // Iterate through all feeds
  Object.keys(feeds).forEach(async line => {
    const url = `http://datamine.mta.info/mta_esi.php?key=${process.env.MTA_API_KEY}&feed_id=${line}`;
    promises.push(makeRequest(url));
  });
  return Promise.all(promises);
}

// Sort function for ordering by arriving first
function arriveFirst(a: ITrip, b: ITrip): number {
  return a.rawEta - b.rawEta;
}

// Get data from the MTA
export const getMtaData = async () => {
    // Prepare response
  const jsonResponse: IJsonResponse = {
    stations: {}
  };

  // Pull in selected stations from environment file
  const stations: string[] = process && process.env && process.env.STATIONS ? process.env.STATIONS.split(" ") : [];
    // Data structure for response
  stations.forEach((station: string) => {
    jsonResponse.stations[station] = {
      name: stationData[station].stop_name,
      trains: []
    };
  });
    // Fetch the data from the MTA
  const responses: any = await getRawData();
    responses.forEach((response: any) => {
        // If successful
    if (response.status === 200) {
      try {

        // Convert from GTFS format to JSON
        const feed = FeedMessage.decode(Buffer.from(response.data, "binary"));

        const currentTime: number = Math.round(Date.now() / 1000);

        // Parse each train's data
        feed.entity.forEach((entity:any) => {
          // Half of the entities are vehiclePosition updates; get the other half, scheduled trip updates
          if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
            // For each scheduled stop on each trip
            entity.tripUpdate.stopTimeUpdate.forEach((scheduledTrip:any) => {
              // If the trip hits one of the selected stations
              if (stations.includes(scheduledTrip.stopId)) {
                // For storing in the JSON response
                const whichStation: string = scheduledTrip.stopId;
                // If a scheduled departure time (an ETA when it will leave that station)
                if (
                  scheduledTrip &&
                  scheduledTrip.departure &&
                  scheduledTrip.departure.time
                ) {
                  // @ts-ignore Difference from current time
                  const timeDiff:number =
                    scheduledTrip.departure.time - currentTime;

                  // If not in the past
                  if (timeDiff > 0) {
                    // @ts-ignore Convert ugly UNIX Epch time to human readable
                    const departureTime: string = convertEpoch(
                      scheduledTrip.departure.time
                    );

                    // Human readable minutes away
                    const minutesAway: string = secsToMins(timeDiff);

                    // Build trip object
                    const trip: ITrip = {
                      trainId: entity.tripUpdate.trip.routeId,
                      eta: departureTime,
                      minAway: minutesAway,
                      rawEta: timeDiff
                    };

                    // Add to response
                    jsonResponse.stations[whichStation].trains.push(trip);
                  }
                }
              }
            });
          }
        });
      } catch (err) {
        jsonResponse.status = 'error';
        jsonResponse.message = `Error. Something went wrong with parsing the MTA feed. ${err}`;
      }
    } else {
      const errMessage = `Error: ${response.statusText}`;
      console.error(errMessage);
      jsonResponse.status = 'error';
      jsonResponse.message = `Error: ${errMessage}`;
    }
  });

  // Sort by arriving first
  Object.values(jsonResponse.stations).forEach(station => {
    station.trains.sort(arriveFirst);
  });
  return jsonResponse;
};


