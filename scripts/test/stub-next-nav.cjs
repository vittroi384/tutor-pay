module.exports = {
  redirect(u) {
    throw new Error("redirect:" + u);
  },
};
