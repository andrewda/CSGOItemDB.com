# CSGOItemDB
[![Codacy Badge](https://api.codacy.com/project/badge/3740b21ca3744edb80a376a9a0596ffa)](https://www.codacy.com/app/dassonville-andrew/CSGOItemDB-com)

CSGOItemDB is a simple API which allows users to get the prices of CS:GO skins.

## Setup

Step 1. Clone the repository to your computer or download the files manually.

```
git clone https://github.com/andrewda/CSGOItemDB
```

Step 2. Edit options.json

```JSON
{
    "errors": {
        "missing_params": "missing parameter(s)",
        "invalid_key": "insufficient privileges (unrecognized key)",
        "not_premium": "insufficient privileges (not premium)",
        "unknown_item": "unknown item"
    },
    "backpacktf_key": "BACKPACK.TF API KEY (can be retreived from http://backpack.tf/api)",
    "update_time": 7200,
    "refresh_interval": 60000,
    "delete_old_interval": 90000
}
```

Step 3. Download any missing dependencies
```
npm update
```


Step 4. Run the server

```
node server.js
```

Step 5. Run the updater

```
node updater.js
```
