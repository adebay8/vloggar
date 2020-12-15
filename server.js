// import libraries
const express = require("express");
const mongodb = require("mongodb");
const bcrypt = require("bcrypt");
const expressSession = require("express-session");
const formidable = require("formidable");
const fileSystem = require("fs");
const {
  getVideoDuration,
  default: getVideoDurationInSeconds,
} = require("get-video-duration");
const { ESRCH } = require("constants");

// app config
const app = express();
app.set("view engine", "ejs");
app.use("/public", express.static(__dirname + "/public"));
const port = process.env.PORT || 3000;

//middleware
//to return users document
const getUser = (id, callBack) => {
  database.collection("users").findOne(
    {
      _id: ObjectId(id),
    },
    (error, user) => {
      callBack(user);
    }
  );
};
app.use(express.json({ limit: "10000mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000,
  })
);
app.use(
  expressSession({
    key: "user_id",
    secret: "user secret object id",
    resave: true,
    saveUninitialized: true,
  })
);

// db config
const mongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;

mongoClient.connect(
  "mongodb://localhost:27017",
  { useUnifiedTopology: true },
  (err, client) => {
    console.log("connected to DB");
    database = client.db("video_streaming");
  }
);

// api routes
app.get("/", (req, res) => {
  database
    .collection("videos")
    .find({})
    .sort({
      createdAt: -1,
    })
    .toArray((error, videos) => {
      res.render("index", {
        isLogin: req.session.user_id ? true : false,
        videos: videos,
      });
    });
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", (req, res) => {
  database.collection("users").findOne(
    {
      email: req.body.email,
    },
    (error, user) => {
      if (user == null) {
        // email does not exist
        bcrypt.hash(req.body.password, 10, (error, hash) => {
          database.collection("users").insertOne(
            {
              name: req.body.name,
              email: req.body.email,
              password: hash,
              coverPhoto: "",
              image: "",
              subscribers: 0,
              subscriptions: [],
              playlists: [],
              videos: [],
              history: [],
              notifications: [],
            },
            (error, data) => {
              res.redirect("/login");
            }
          );
        });
      } else {
        res.send("Email already exists");
      }
    }
  );
});

app.get("/login", (req, res) => {
  res.render("login", {
    error: "",
    message: "",
  });
});

app.post("/login", (req, res) => {
  database.collection("users").findOne(
    {
      email: req.body.email,
    },
    (error, user) => {
      if (user == null) {
        res.send("Email does not exists");
      } else {
        //compare password in database and entered password
        bcrypt.compare(req.body.password, user.password, (error, isVerify) => {
          if (isVerify) {
            // save user id session
            req.session.user_id = user._id;
            res.redirect("/");
          } else {
            res.send("Password is not correct");
          }
        });
      }
    }
  );
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/upload", (req, res) => {
  //check if user is logged in
  if (req.session.user_id) {
    // create new page for upload
    res.render("upload", {
      isLogin: true,
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/upload-video", (req, res) => {
  //check if user is logged in
  if (req.session.user_id) {
    const formData = new formidable.IncomingForm();
    formData.maxFileSize = 1000 * 1024 * 1024;
    formData.parse(req, (error, fields, files) => {
      const title = fields.title;
      const description = fields.description;
      const tags = fields.tags;
      const category = fields.category;

      const oldPathThumbnail = files.thumbnail.path;
      const thumbnail =
        "public/thumbnails/" +
        new Date().getTime() +
        "-" +
        files.thumbnail.name;

      fileSystem.rename(oldPathThumbnail, thumbnail, (error) => {});

      const oldPathVideo = files.video.path;
      const newPath =
        "public/videos/" + new Date().getTime() + "-" + files.video.name;

      fileSystem.rename(oldPathVideo, newPath, (error) => {
        //get user data to save in videos document

        getUser(req.session.user_id, (user) => {
          const currentTime = new Date().getTime();

          // get video duration
          getVideoDurationInSeconds(newPath).then((duration) => {
            const hours = Math.floor(duration / 60 / 60);
            const minutes = Math.floor(duration / 60) - hours * 60;
            const seconds = Math.floor(duration % 60);

            // insert into database
            database.collection("videos").insertOne(
              {
                user: {
                  _id: user._id,
                  name: user.name,
                  image: user.image,
                  subscribers: user.subscribers,
                },
                filePath: newPath,
                thumbnail: thumbnail,
                title: title,
                description: description,
                tags: tags,
                category: category,
                createdAt: currentTime,
                minutes: minutes,
                seconds: seconds,
                hours: hours,
                watch: currentTime,
                views: 0,
                playlist: "",
                liked_by: [],
                disliked_by: [],
                comments: [],
              },
              (error, data) => {
                // insert in users collection too

                database.collection("users").updateOne(
                  {
                    _id: ObjectId(req.session.user_id),
                  },
                  {
                    $push: {
                      videos: {
                        _id: data.insertedId,
                        title: title,
                        views: 0,
                        thumbnail: thumbnail,
                        watch: currentTime,
                      },
                    },
                  }
                );
                res.redirect("/");
              }
            );
          });
        });
      });
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/watch/:watch", (req, res) => {
  database.collection("videos").findOne(
    {
      watch: parseInt(req.params.watch),
    },
    (error, video) => {
      if (video == null) {
        res.send("Video does not exist");
      } else {
        // increment view count
        database.collection("videos").updateOne(
          {
            _id: ObjectId(video._id),
          },
          {
            $inc: {
              views: 1,
            },
          }
        );
        res.render("video-page/index", {
          isLogin: req.session.user_id ? true : false,
          video: video,
          playlist: [],
          playlistId: "",
        });
      }
    }
  );
});

app.post("/do-like", (req, res) => {
  if (req.session.user_id) {
    // check if user already liked

    database.collection("videos").findOne(
      {
        $and: [
          {
            _id: ObjectId(req.body.videoId),
          },
          {
            "liked_by._id": req.session.user_id,
          },
        ],
      },
      (error, video) => {
        if (video == null) {
          // push in likers array

          database.collection("videos").updateOne(
            {
              _id: ObjectId(req.body.videoId),
            },
            {
              $push: {
                liked_by: {
                  _id: req.session.user_id,
                },
              },
            },
            (error, data) => {
              res.json({
                status: "success",
                message: "You liked this video",
              });
            }
          );
        } else {
          res.json({
            status: "error",
            message: "Already liked the video",
          });
        }
      }
    );
  } else {
    res.json({
      status: "error",
      message: "Login to like this video",
    });
  }
});

app.post("/do-dislike", (req, res) => {
  if (req.session.user_id) {
    // check if user already liked

    database.collection("videos").findOne(
      {
        $and: [
          {
            _id: ObjectId(req.body.videoId),
          },
          {
            "disliked_by._id": req.session.user_id,
          },
        ],
      },
      (error, video) => {
        if (video == null) {
          // push in dislikers array

          database.collection("videos").updateOne(
            {
              _id: ObjectId(req.body.videoId),
            },
            {
              $push: {
                disliked_by: {
                  _id: req.session.user_id,
                },
              },
            },
            (error, data) => {
              res.json({
                status: "success",
                message: "You disliked this video",
              });
            }
          );
        } else {
          res.json({
            status: "error",
            message: "Already disliked the video",
          });
        }
      }
    );
  } else {
    res.json({
      status: "error",
      message: "Login to dislike this video",
    });
  }
});

app.post("/do-comment", (req, res) => {
  if (req.session.user_id) {
    // get user that made comment

    getUser(req.session.user_id, (user) => {
      database.collection("videos").findOneAndUpdate(
        {
          _id: ObjectId(req.body.videoId),
        },
        {
          $push: {
            comments: {
              _id: ObjectId(),
              user: {
                _id: user._id,
                name: user.name,
                image: user.image,
              },
              comment: req.body.comment,
              createdAt: new Date().getTime(),
              replies: [],
            },
          },
        },
        (error, data) => {
          const channelId = data.value.user._id;
          database.collection("users").updateOne(
            {
              _id: ObjectId(channelId),
            },
            {
              $push: {
                notifications: {
                  _id: ObjectId(),
                  type: "new_comment",
                  content: req.body.comment,
                  is_read: false,
                  video_watch: data.value.watch,
                  user: {
                    _id: user._id,
                    name: user.name,
                    image: user.image,
                  },
                },
              },
            }
          );

          res.json({
            status: "success",
            message: "comment has been posted",
            user: {
              _id: user._id,
              name: user.name,
              image: user.image,
            },
          });
        }
      );
    });
  } else {
    res.json({
      status: "error",
      message: "Please login to comment",
    });
  }
});

app.get("/get-user", (req, res) => {
  if (req.session.user_id) {
    getUser(req.session.user_id, (user) => {
      delete user.password;

      res.json({
        status: "success",
        message: "Record has been fetched",
        user: user,
      });
    });
  } else {
    res.json({
      status: "error",
      message: "Please login to perform this action",
    });
  }
});

app.post("/read-notification", (req, res) => {
  if (req.session.user_id) {
    database.collection("users").updateOne(
      {
        $and: [
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            "notifications._id": ObjectId(req.body.notificationId),
          },
        ],
      },
      {
        $set: {
          "notifications.$.is_read": true,
        },
      },
      (error, data) => {
        res.json({
          status: "success",
          message: "Notification has been marked as read",
        });
      }
    );
  } else {
    res.json({
      status: "error",
      message: "Please login to perform this action",
    });
  }
});

app.post("/do-reply", (req, res) => {
  if (req.session.user_id) {
    var reply = req.body.reply;
    var commentId = req.body.commentId;

    getUser(req.session.user_id, (user) => {
      database.collection("videos").findOneAndUpdate(
        {
          "comments._id": ObjectId(commentId),
        },
        {
          $push: {
            "comments.$.replies": {
              _id: ObjectId(),
              user: {
                _id: user._id,
                name: user.name,
                image: user.image,
              },
              reply: reply,
              createdAt: new Date().getTime(),
            },
          },
        },
        (error, data) => {
          var videoWatch = data.value.watch;
          for (var a = 0; a < data.value.comments.length; a++) {
            var comment = data.value.comments[a];

            if (comment._id == commentId) {
              var _id = comment.user._id;

              database.collection("users").updateOne(
                {
                  _id: ObjectId(_id),
                },
                {
                  $push: {
                    notifications: {
                      _id: ObjectId(),
                      type: "new_reply",
                      content: reply,
                      is_read: false,
                      video_watch: videoWatch,
                      user: {
                        _id: user._id,
                        name: user.name,
                        image: user.image,
                      },
                    },
                  },
                }
              );
              break;
            }
          }
          res.json({
            status: "success",
            message: "Reply has been posted",
            user: {
              _id: user._id,
              name: user.name,
              image: user.image,
            },
          });
        }
      );
    });
  } else {
    res.json({
      status: "error",
      message: "Please login to perform this action",
    });
  }
});

app.post("/do-subscribe", (req, res) => {
  if (req.session.user_id) {
    database.collection("videos").findOne(
      {
        _id: ObjectId(req.body.videoId),
      },
      (error, video) => {
        if (req.session.user_id == video.user._id) {
          res.json({
            status: "error",
            message: "You cannot subscribe to your own channel",
          });
        } else {
          // check if user is already subscribed to channel

          getUser(req.session.user_id, (myData) => {
            const flag = false;

            for (var a = 0; a < myData.subscriptions.length; a++) {
              if (
                myData.subscriptions[a]._id.toString() ==
                video.user._id.toString()
              ) {
                flag = true;
                break;
              }
            }

            if (flag) {
              res.json({
                status: "error",
                message: "Already subscribed",
              });
            } else {
              database.collection("users").findOneAndUpdate(
                {
                  _id: video.user._id,
                },
                {
                  $inc: {
                    subscribers: 1,
                  },
                },
                {
                  returnOriginal: false,
                },
                (error2, userData) => {
                  database.collection("users").updateOne(
                    {
                      _id: ObjectId(req.session.user_id),
                    },
                    {
                      $push: {
                        subscriptions: {
                          _id: video.user._id,
                          name: video.user.name,
                          subscribers: userData.value.subscribers,
                          image: userData.value.image,
                        },
                      },
                    },
                    (error3, data) => {
                      database.collection("videos").findOneAndUpdate(
                        {
                          _id: ObjectId(req.body.videoId),
                        },
                        {
                          $inc: {
                            "user.subscribers": 1,
                          },
                        }
                      );

                      res.json({
                        status: "success",
                        message: "subscription has been added",
                      });
                    }
                  );
                }
              );
            }
          });
        }
      }
    );
  } else {
    res.json({
      status: "error",
      message: "please login to perform this action",
    });
  }
});

app.get("/get-related-videos/:category/:videoId", (req, res) => {
  database
    .collection("videos")
    .find({
      $and: [
        {
          category: req.params.category,
        },
        {
          _id: {
            $ne: ObjectId(req.params.videoId),
          },
        },
      ],
    })
    .toArray((error, videos) => {
      // shuffle the array of videos

      for (var a = 0; a < videos.length; a++) {
        var x = videos[a];
        var y = Math.floor(Math.random() * (a + 1));
        videos[a] = videos[y];
        videos[y] = x;
      }
      res.json(videos);
    });
});

app.post("/save-history", (req, res) => {
  if (req.session.user_id) {
    database.collection("videos").findOne(
      {
        _id: ObjectId(req.body.videoId),
      },
      (error, video) => {
        database.collection("users").findOne(
          {
            $and: [
              {
                _id: ObjectId(req.session.user_id),
              },
              {
                "history.videoId": req.body.videoId,
              },
            ],
          },
          (error, history) => {
            if (history == null) {
              database.collection("users").updateOne(
                {
                  _id: ObjectId(req.session.user_id),
                },
                {
                  $push: {
                    history: {
                      _id: ObjectId(),
                      videoId: req.body.videoId,
                      watch: video.watch,
                      title: video.title,
                      watched: req.body.watched,
                      thumbnail: video.thumbnail,
                      minutes: video.minutes,
                      seconds: video.seconds,
                    },
                  },
                }
              );
              res.json({
                status: "success",
                message: "History has been added",
              });
            } else {
              database.collection("users").updateOne(
                {
                  $and: [
                    {
                      _id: ObjectId(req.session.user_id),
                    },
                    {
                      "history.videoId": req.body.videoId,
                    },
                  ],
                },
                {
                  $set: {
                    "history.$.watched": req.body.watched,
                  },
                }
              );
              res.json({
                status: "success",
                message: "History has been updated",
              });
            }
          }
        );
      }
    );
  } else {
    res.json({
      status: "error",
      message: "Please login to perform this action",
    });
  }
});

app.get("/watch-history", (req, res) => {
  if (req.session.user_id) {
    getUser(req.session.user_id, (user) => {
      res.render("watch-history", {
        isLogin: true,
        videos: user.history,
      });
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/delete-from-history", (req, res) => {
  if (req.session.user_id) {
    database.collection("users").updateOne(
      {
        $and: [
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            "history.videoId": req.body.videoId,
          },
        ],
      },
      {
        $pull: {
          history: {
            videoId: req.body.videoId,
          },
        },
      }
    );
    res.redirect("/watch-history");
  } else {
    res.redirect("/login");
  }
});

app.get("/channel/:_id", (req, res) => {
  getUser(req.params._id, (user) => {
    if (user == null) {
      res.send("Channel not found");
    } else {
      res.render("single-channel", {
        isLogin: req.session.user_id ? true : false,
        user: user,
        isMyChannel: req.session.user_id === req.params._id,
      });
    }
  });
});

app.post("/change-profile-picture", (req, res) => {
  if (req.session.user_id) {
    var formData = new formidable.IncomingForm();
    formData.parse(req, (error, fields, files) => {
      var oldPath = files.image.path;
      var newPath =
        "public/profiles/" + req.session.user_id + "-" + files.image.name;
      fileSystem.rename(oldPath, newPath, (error) => {
        database.collection("users").updateOne(
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            $set: {
              image: newPath,
            },
          }
        );

        database.collection("users").updateOne(
          {
            "subscriptions._id": ObjectId(req.session.user_id),
          },
          {
            $set: {
              "subscriptions.$.image": newPath,
            },
          }
        );

        database.collection("videos").updateMany(
          {
            "user._id": ObjectId(req.session.user_id),
          },
          {
            $set: {
              "user.image": newPath,
            },
          }
        );

        res.redirect("/channel/" + req.session.user_id);
      });
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/change-cover-picture", (req, res) => {
  if (req.session.user_id) {
    var formData = new formidable.IncomingForm();
    formData.parse(req, (error, fields, files) => {
      var oldPath = files.image.path;
      var newPath =
        "public/covers/" + req.session.user_id + "-" + files.image.name;
      fileSystem.rename(oldPath, newPath, (error) => {
        database.collection("users").updateOne(
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            $set: {
              coverPhoto: newPath,
            },
          }
        );
        res.redirect("/channel/" + req.session.user_id);
      });
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/edit/:watch", (req, res) => {
  if (req.session.user_id) {
    database.collection("videos").findOne(
      {
        $and: [
          {
            watch: parseInt(req.params.watch),
          },
          {
            "user._id": ObjectId(req.session.user_id),
          },
        ],
      },
      (error, video) => {
        if (video == null) {
          res.send("Sorry you don't own this video");
        } else {
          getUser(req.session.user_id, (user) => {
            res.render("edit-videos", {
              isLogin: true,
              video: video,
              user: user,
            });
          });
        }
      }
    );
  } else {
    res.redirect("/login");
  }
});

app.post("/edit", (req, res) => {
  if (req.session.user_id) {
    var formData = new formidable.IncomingForm();
    formData.parse(req, (error, fields, files) => {
      database.collection("videos").findOne(
        {
          $and: [
            {
              _id: ObjectId(fields.videoId),
            },
            {
              "user._id": ObjectId(req.session.user_id),
            },
          ],
        },
        (error, mainVideo) => {
          if (mainVideo == null) {
            res.send("Sorry you do not own this video");
          } else {
            if (files.thumbnail.size > 0) {
              var oldPath = files.thumbnail.path;
              fileSystem.rename(oldPath, mainVideo.thumbnail, (error) => {});
            }
            database.collection("videos").findOneAndUpdate(
              {
                _id: ObjectId(fields.videoId),
              },
              {
                $set: {
                  title: fields.title,
                  description: fields.description,
                  tags: fields.tags,
                  category: fields.category,
                  thumbnail: mainVideo.thumbnail,
                  playlist: fields.playlist,
                },
              },
              (error, data) => {
                database.collection("users").findOneAndUpdate(
                  {
                    $and: [
                      {
                        _id: ObjectId(req.session.user_id),
                      },
                      {
                        "videos._id": ObjectId(fields.videoId),
                      },
                    ],
                  },
                  {
                    $set: {
                      "videos.$.title": fields.title,
                      "videos.$.thumbnail": mainVideo.thumbnail,
                    },
                  }
                );
                if (fields.playlist == "") {
                  database.collection("users").updateOne(
                    {
                      $and: [
                        {
                          _id: ObjectId(req.session.user_id),
                        },
                        {
                          "playlists._id": ObjectId(mainVideo.playlist),
                        },
                      ],
                    },
                    {
                      $pull: {
                        "playlists.$.videos": {
                          _id: fields.videoId,
                        },
                      },
                    }
                  );
                } else {
                  if (mainVideo.playlist != "") {
                    database.collection("users").updateOne(
                      {
                        $and: [
                          {
                            _id: ObjectId(req.session.user_id),
                          },
                          {
                            "playlists._id": ObjectId(mainVideo.playlist),
                          },
                        ],
                      },
                      {
                        $pull: {
                          "playlists.$.videos": {
                            _id: fields.videoId,
                          },
                        },
                      }
                    );
                  }
                  database.collection("users").updateOne(
                    {
                      $and: [
                        {
                          _id: ObjectId(req.session.user_id),
                        },
                        {
                          "playlists._id": ObjectId(fields.playlist),
                        },
                      ],
                    },
                    {
                      $push: {
                        "playlists.$.videos": {
                          _id: fields.videoId,
                          title: fields.title,
                          watch: mainVideo.watch,
                          thumbnail: mainVideo.thumbnail,
                        },
                      },
                    }
                  );
                }

                res.redirect("/edit/" + mainVideo.watch);
              }
            );
          }
        }
      );
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/delete-video", (req, res) => {
  if (req.session.user_id) {
    database.collection("videos").findOne(
      {
        $and: [
          {
            _id: ObjectId(req.body._id),
          },
          {
            "user._id": ObjectId(req.session.user_id),
          },
        ],
      },
      (error, video) => {
        if (video == null) {
          res.send("Sorry. You do not own this video.");
          return;
        }
        fileSystem.unlink(video.filePath, (error) => {
          fileSystem.unlink(video.thumbnail, (error) => {});
        });
        database.collection("videos").remove({
          $and: [
            {
              _id: ObjectId(req.body._id),
            },
            {
              "user._id": ObjectId(req.session.user_id),
            },
          ],
        });
        database.collection("users").findOneAndUpdate(
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            $pull: {
              videos: {
                _id: ObjectId(req.body._id),
              },
            },
          }
        );
        database.collection("users").updateMany(
          {},
          {
            $pull: {
              history: {
                videoId: req.body._id.toString(),
              },
            },
          }
        );

        getUser(req.session.user_id, (user) => {
          var playlistId = "";
          for (var a = 0; a < user.playlists.length; a++) {
            for (var b = 0; b < user.playlists[a].videos.length; b++) {
              var video = user.playlists[a].videos[b];

              if (video._id == req.body._id) {
                playlistId = user.playlists[a]._id;
                break;
              }
            }
          }
          if (playlistId != "") {
            database.collection("users").updateOne(
              {
                $and: [
                  {
                    _id: ObjectId(req.session.user_id),
                  },
                  {
                    "playlists._id": ObjectId(playlistId),
                  },
                ],
              },
              {
                $pull: {
                  "playlists.$.videos": {
                    _id: req.body._id,
                  },
                },
              }
            );
          }
        });
        res.redirect("/channel/" + req.session.user_id);
      }
    );
  } else {
    res.redirect("/login");
  }
});

app.post("/create-playlist", (req, res) => {
  if (req.session.user_id) {
    database.collection("users").updateOne(
      {
        _id: ObjectId(req.session.user_id),
      },
      {
        $push: {
          playlists: {
            _id: ObjectId(),
            title: req.body.title,
            videos: [],
          },
        },
      }
    );
    res.redirect("/channel/" + req.session.user_id);
  } else {
    res.redirect("/login");
  }
});

app.get("/playlist/:_id/:watch", (req, res) => {
  database.collection("videos").findOne(
    {
      $and: [
        {
          watch: parseInt(req.params.watch),
        },
        {
          playlist: req.params._id,
        },
      ],
    },
    (error, video) => {
      if (video == null) {
        res.send("Video does not exist.");
      } else {
        database.collection("videos").updateOne(
          {
            _id: ObjectId(video._id),
          },
          {
            $inc: {
              views: 1,
            },
          }
        );
        getUser(req.session.user_id, (user) => {
          var playlistVideos = [];
          for (var a = 0; a < user.playlists.length; a++) {
            if (user.playlists[a]._id == req.params._id) {
              playlistVideos = user.playlists[a].videos;
              break;
            }
          }
          res.render("video-page/index", {
            isLogin: req.session.user_id ? true : false,
            video: video,
            playlist: playlistVideos,
            playlistId: req.params._id,
          });
        });
      }
    }
  );
});

app.post("/delete-playlist", (req, res) => {
  if (req.session.user_id) {
    database.collection("users").findOne(
      {
        $and: [
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            "playlists._id": ObjectId(req.body._id),
          },
        ],
      },
      (error, data) => {
        if (data == null) {
          res.send("Sorry. You dont own this playlist.");
          return;
        }
        database.collection("users").updateOne(
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            $pull: {
              playlists: {
                _id: ObjectId(req.body._id),
              },
            },
          }
        );
        database.collection("videos").updateMany(
          {
            playlists: req.body._id,
          },
          {
            $set: {
              playlist: "",
            },
          }
        );
      }
    );
    res.redirect("/channel/" + req.session.user_id);
  } else {
    res.redirect("/login");
  }
});

app.get("/my_subscriptions", (req, res) => {
  if (req.session.user_id) {
    getUser(req.session.user_id, (user) => {
      res.render("subscriptions", {
        isLogin: true,
        user: user,
      });
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/remove-channel-from-subscription", (req, res) => {
  if (req.session.user_id) {
    database.collection("users").updateOne(
      {
        _id: ObjectId(req.session.user_id),
      },
      {
        $pull: {
          subscriptions: {
            _id: ObjectId(req.body._id),
          },
        },
      },
      (error, data) => {
        if (data.modifiedCount > 0) {
          database.collection("users").updateOne(
            {
              _id: ObjectId(req.body._id),
            },
            {
              $dec: {
                subscribers: 1,
              },
            }
          );
          database.collection("videos").updateOne(
            {
              "user._id": ObjectId(req.body._id),
            },
            {
              $dec: {
                "user.$.subscribers": 1,
              },
            }
          );
        }
        res.redirect("/my_subscriptions");
      }
    );
  } else {
    res.redirect("/login");
  }
});

app.get("/category_search/:query", (req, res) => {
  database
    .collection("videos")
    .find({
      category: {
        $regex: ".*?" + req.params.query + ".*?",
      },
    })
    .toArray((error, videos) => {
      res.render("search", {
        isLogin: req.session.user_id ? true : false,
        videos: videos,
        query: req.params.query,
      });
    });
});

app.get("/tag_search/:query", (req, res) => {
  database
    .collection("videos")
    .find({
      tags: {
        $regex: ".*" + req.params.query + ".*",
        $options: "i",
      },
    })
    .toArray((error, videos) => {
      res.render("search", {
        isLogin: req.session.user_id ? true : false,
        videos: videos,
        query: req.params.query,
      });
    });
});

app.get("/search", (req, res) => {
  database
    .collection("videos")
    .find({
      title: {
        $regex: req.query.search_query,
        $options: "i",
      },
    })
    .toArray((error, videos) => {
      res.render("search", {
        isLogin: req.session.user_id ? true : false,
        videos: videos,
        query: req.query.search_query,
      });
    });
});

app.get("/settings", (req, res) => {
  if (req.session.user_id) {
    getUser(req.session.user_id, (user) => {
      res.render("settings", {
        isLogin: true,
        user: user,
        request: req.query,
      });
    });
  }
});

app.post("/save_settings", (req, res) => {
  if (req.session.user_id) {
    if (req.body.password == "") {
      database.collection("users").updateOne(
        {
          _id: ObjectId(req.session.user_id),
        },
        {
          $set: {
            name: req.body.name,
          },
        }
      );
    } else {
      bcrypt.hash(req.body.password, 10, (error, hash) => {
        database.collection("users").updateOne(
          {
            _id: ObjectId(req.session.user_id),
          },
          {
            $set: {
              name: req.body.name,
              password: hash,
            },
          }
        );
      });
    }
    database.collection("users").updateMany(
      {
        "subscriptions._id": ObjectId(req.session.user_id),
      },
      {
        $set: {
          "subscriptions.$.name": req.body.name,
        },
      }
    );
    database.collection("videos").updateMany(
      {
        "user._id": ObjectId(req.session.user_id),
      },
      {
        $set: {
          "user.name": req.body.name,
        },
      },
      (error, data) => {
        res.redirect("/settings?message=success");
      }
    );
  } else {
    res.redirect("/login");
  }
});
// app listening
app.listen(port, () => {
  console.log("Server is started.....");
});
