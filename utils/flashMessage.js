exports.setFlashMessage = (res, message, type = 'info') => {
    res.cookie('flashMessage', message, { maxAge: 3000 });
    res.cookie('flashType', type, { maxAge: 3000 });
};
