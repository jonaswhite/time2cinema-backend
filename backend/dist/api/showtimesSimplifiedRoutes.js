"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showtimesSimplifiedRouter = void 0;
const express_1 = __importDefault(require("express"));
const showtimes_simplified_1 = require("./showtimes_simplified");
const router = express_1.default.Router();
// 獲取特定電影的簡化場次資料
router.get('/movie/:movieId', (req, res) => {
    (0, showtimes_simplified_1.getSimplifiedShowtimesByMovie)(req, res);
});
exports.showtimesSimplifiedRouter = router;
