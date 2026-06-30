const express = require("express");
const { allowRoles } = require("../middleware/auth");
const {
  listSellers,
  createUser,
  deactivateUser,
  reassignClients
} = require("../controllers/usersController");

const router = express.Router();

router.get("/", allowRoles("admin"), listSellers);
router.post("/", allowRoles("admin"), createUser);
router.patch("/:id/deactivate", allowRoles("admin"), deactivateUser);
router.post("/reassign-clients", allowRoles("admin"), reassignClients);

module.exports = router;
