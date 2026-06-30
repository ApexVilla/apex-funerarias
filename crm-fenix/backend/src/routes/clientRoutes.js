const express = require("express");
const { allowRoles } = require("../middleware/auth");
const {
  listClients,
  getClient,
  createClient,
  updateClient,
  removeClient
} = require("../controllers/clientsController");

const router = express.Router();

router.get("/", listClients);
router.get("/:id", getClient);
router.post("/", allowRoles("admin"), createClient);
router.put("/:id", allowRoles("admin"), updateClient);
router.delete("/:id", allowRoles("admin"), removeClient);

module.exports = router;
