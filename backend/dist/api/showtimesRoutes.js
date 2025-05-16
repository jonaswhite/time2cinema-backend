"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showtimesRouter = void 0;
const express_1 = __importDefault(require("express"));
const showtimes_1 = require("./showtimes");
const router = express_1.default.Router();
// 獲取所有場次
router.get('/', (req, res) => {
    (0, showtimes_1.getAllShowtimes)(req, res);
});
// 獲取特定電影院的場次
router.get('/theater/:theaterId', (req, res) => {
    (0, showtimes_1.getShowtimesByTheater)(req, res);
});
// 獲取特定電影的場次
router.get('/movie/:movieName', (req, res) => {
    (0, showtimes_1.getShowtimesByMovie)(req, res);
});
// 獲取特定電影ID的場次
router.get('/movie-id/:id', (req, res) => {
    // 將 movieName 參數設置為 ID
    req.params.movieName = req.params.id;
    (0, showtimes_1.getShowtimesByMovie)(req, res);
});
// 獲取特定日期的場次
router.get('/date/:date', (req, res) => {
    (0, showtimes_1.getShowtimesByDate)(req, res);
});
exports.showtimesRouter = router;
