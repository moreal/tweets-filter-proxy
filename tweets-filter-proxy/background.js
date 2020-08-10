function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  console.log("New request came, ", details.method, details.url);

  if (details.method === "OPTIONS") {
    console.log("Ignore 'OPTIONS' request.")
    return {};
  }

  const data = [];
  filter.ondata = event => {
    data.push(event.data);
  }

  filter.onstop = event => {
    const rawJson = data.map(stream => decoder.decode(stream, { stream: true })).join("");
    console.debug("rawJson.length: ", rawJson.length);

    const json = JSON.parse(rawJson);

    console.debug(json);

    const tweets = json.globalObjects.tweets;
    const timelineInstructionEntries = json.timeline.instructions[0].addEntries.entries;

    const removedTweetIds = new Set();
    const removedTweets = new Set();
    const removedEntryIds = new Set();

    // FIXME: they should be configurable.
    const ignoreRT = true;
    const ignoreLike = true;

    // TODO: implement later
    const ignoreConversation = false;

    for (let entryIndex = 0; entryIndex < timelineInstructionEntries.length - 2; ++entryIndex) {
      const entry = timelineInstructionEntries[entryIndex];
      const entryId = entry.entryId;
      
      const [entryType, tweetId] = entryId.split("-");

      if (entryType === "homeConversation") {
        console.log("Skip 'homeConversation-*', entry:", entry);
        continue;
      }

      const tweet = tweets[tweetId];

      if (ignoreLike) {
        // FIXME: it should be separtated another comparer class.
        if (entry.content?.item?.content?.tweet?.socialContext?.generalContext?.contextType === "Like") {
          console.log("Ignore Like:", entryIndex, tweetId, entry);
          removedEntryIds.add(entryId);
          removedTweetIds.add(tweetId);
        }
      }

      if (ignoreRT) {
        if (tweet.retweeted_status_id_str !== undefined) {
          console.log("Ignore RT:", entryIndex, tweetId, tweet);
          const retweetedTweetId = tweet.retweeted_status_id_str;

          removedEntryIds.add(entryId);
          removedTweetIds.add(retweetedTweetId);
          removedTweetIds.add(tweetId);
        }
      }

      if (ignoreConversation) {
        if (tweet.self_thread !== undefined &&
          tweet.conversation_id_str !== tweet.self_thread.id_str) {
          console.log("Ignore Conversation:", entryIndex, tweetId, tweet);
          removedEntryIds.add(entryId);
          removedTweetIds.add(tweetId);
          removedTweets.add(tweet);
        }
      }
    }

    for (const tweetId of removedTweetIds) {
      console.debug("Delete tweet, tweetId:", tweetId);
      delete tweets[tweetId];
    }

    const newTimelineInstructionEntries =
      timelineInstructionEntries.slice(0, -2).filter(entry => !removedEntryIds.has(entry.entryId));

    console.debug(timelineInstructionEntries);
    console.debug(newTimelineInstructionEntries);

    json.timeline.instructions[0].addEntries.entries = newTimelineInstructionEntries;
    console.debug(json);

    filter.write(encoder.encode(JSON.stringify(json)));
    console.debug("Removed", removedTweetIds);
    console.debug("Removed", removedTweets);
    console.debug("Removed", removedEntryIds);
    filter.close();
  }
}

browser.webRequest.onBeforeRequest.addListener(
  listener,
  { urls: ["https://api.twitter.com/2/timeline/home.json*"], types: ["xmlhttprequest"] },
  ["blocking"]
);
