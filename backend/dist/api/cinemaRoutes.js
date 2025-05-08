"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cinemaRouter = void 0;
const express_1 = __importDefault(require("express"));
const cinemas_1 = require("./cinemas");
const router = express_1.default.Router();
// 獲取所有電影院
router.get('/', (req, res) => {
    (0, cinemas_1.getAllCinemas)(req, res);
});
// 獲取特定城市的電影院
router.get('/city/:city', (req, res) => {
    (0, cinemas_1.getCinemasByCity)(req, res);
});
// 獲取特定電影院
router.get('/:id', (req, res) => {
    (0, cinemas_1.getCinemaById)(req, res);
});
exports.cinemaRouter = router;
