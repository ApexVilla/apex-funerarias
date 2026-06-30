const express = require("express");
const { allowRoles } = require("../middleware/auth");
const {
  createContact,
  listContacts,
  exportContactsExcel
} = require("../controllers/contactsController");

const router = express.Router();

router.get("/", listContacts);
router.post("/", createContact);
router.get("/export/excel", allowRoles("admin"), exportContactsExcel);

module.exports = router;
